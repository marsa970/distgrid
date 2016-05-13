var semaphore = require("semaphore");
var protocol = new (require("../../protocol/app/protocol.js"))();
/*
Takes a json object descibing a new job.
The meta-data object:
{
    command: String,
    input_filenames: [String],
    post_command: String,
    min_memory: Number,
    args: [String]
}
*/
var Job = function(description){
    if( !("command" in description &&
        "input_filenames" in description &&
        "min_memory" in description &&
        "run_in_shell" in description &&
        "args" in description)){
        throw "Missing description params!";
    }

    var name = "NONAME";
    if( description.name !== undefined && typeof description.name == "string" ){
        name = description.name;
    }
    var command = description.command;
    var input_filenames = description.input_filenames;
    var total_tasks = input_filenames.length;
    var run_in_shell = description.run_in_shell;
    var args = description.args;
    var buffering = [];
    if( "buffering" in description && Array.isArray(description.buffering)){
        buffering = description.buffering;
    }
    this.min_memory = description.min_memory;
    var queue_mode = description.queue_mode !== undefined ? description.queue_mode : false;
    var queue_output = description.queue_output !== undefined ? description.queue_output : false;
    var single_client = description.single_client !== undefined ? description.single_client : false;
    var completed_tasks = 0;
    var pending_tasks_sema = semaphore(1);
    var pending_tasks = [];
    var done_tasks_ahead_of_base = [];
    var first_possible_not_done = 0;
    var all_tasks_done_including = -1;
    var failed_tasks = [];

    // Statistics
    var started_at = null;
    var finished_at = null;
    var tasks_completion_time = new Array(input_filenames.length);
    var tasks_average_time_inner = 0;
    var tasks_average_time_outer = 0;
    var task_comp_max_inner = 0;
    var task_comp_max_outer = 0;
    var task_comp_min_inner = Number.MAX_SAFE_INTEGER;
    var task_comp_min_outer = Number.MAX_SAFE_INTEGER;

    var getNewTaskIndex = (callback) => {
        pending_tasks_sema.take(function(){
            for( var i = first_possible_not_done; i < input_filenames.length; i++ ){
                //console.log("Checking", i);
                if( pending_tasks.indexOf(i) == -1 &&
                    done_tasks_ahead_of_base.indexOf(i) == -1 ){
                    pending_tasks.push(i);
                    pending_tasks_sema.leave();
                    callback(i);
                    return;
                }
            }
            callback(null);
            pending_tasks_sema.leave();
        });
    };

    this.tasksAvailable = () => {
        return (completed_tasks + pending_tasks.length < total_tasks);
    };

    this.done = () => {
        if(completed_tasks >= total_tasks){
            if( finished_at === null ){
                finished_at = Date.now();
                tasks_completion_time.forEach((comp_time,i)=>{
                    tasks_average_time_inner += comp_time.inner;
                    tasks_average_time_outer += comp_time.outer;

                    task_comp_min_inner = comp_time.inner < task_comp_min_inner ? comp_time.inner : task_comp_min_inner;
                    task_comp_max_inner = comp_time.inner > task_comp_max_inner ? comp_time.inner : task_comp_max_inner;

                    task_comp_min_outer = comp_time.outer < task_comp_min_outer ? comp_time.outer : task_comp_min_outer;
                    task_comp_max_outer = comp_time.outer > task_comp_max_outer ? comp_time.outer : task_comp_max_outer;
                });
                tasks_average_time_inner = tasks_average_time_inner / tasks_completion_time.length;
                tasks_average_time_outer = tasks_average_time_outer / tasks_completion_time.length;
                logger.stat(
                    "Job",
                    name,
                    "finished;",
                    "total time:", finished_at - started_at,
                    ";start:", started_at,
                    ";finish:", finished_at,
                    ";average time per task inner:",
                    tasks_average_time_inner,
                    ";average time per task outer:",
                    tasks_average_time_outer,
                    ";inner min:",
                    task_comp_min_inner,
                    ";inner max:",
                    task_comp_max_inner,
                    ";outer min:",
                    task_comp_min_outer,
                    ";outer max:",
                    task_comp_max_outer,
                    ";"
                );
            }
            return true;
        } else {
            return false;
        }
    };

    this.getTask = (job_id, callback) => {
        if( started_at === null ){
            started_at = Date.now();
        }
        getNewTaskIndex(function(index){
            var task = null;
            if( index !== null ){
                // Statistics
                tasks_completion_time[index] = {
                    start: Date.now()
                };

                var output_args = args.concat([input_filenames[index]]);
                output_args.push(input_filenames[index] + ".outfile");

                task = new protocol.Task(
                    job_id,
                    index,
                    command,
                    output_args,
                    output_args.length - 2,
                    output_args.length - 1,
                    run_in_shell,
                    buffering,
                    queue_mode,
                    queue_output,
                    single_client
                );
            }
            callback(task);
        });
    };

    this.finishTaskOnClient = (id) => {
        tasks_completion_time[id].inner = Date.now() -  tasks_completion_time[id].start;
    };

    this.finishTask = (id) => {
        // Statistics
        tasks_completion_time[id].outer = Date.now() - tasks_completion_time[id].start;

        completed_tasks++;
        pending_tasks_sema.take(function(){
            var pti = pending_tasks.indexOf(id);
            if( pti != -1 ){
                pending_tasks.splice(pti, 1);
            } else {
                logger.error("could not find", id, "in pending tasks!");
            }

            if( id == all_tasks_done_including + 1){
                all_tasks_done_including++;
                while(true){
                    if( done_tasks_ahead_of_base[0] == all_tasks_done_including + 1 ){
                        done_tasks_ahead_of_base.shift();
                        all_tasks_done_including++;
                    } else {
                        break;
                    }
                }
            } else {
                //Ahead of base, push and sort
                done_tasks_ahead_of_base.push(id);
                done_tasks_ahead_of_base.sort((a,b)=>{return a-b});
            }

            first_possible_not_done = all_tasks_done_including + 1;

            //console.log("FPND pushed to:", first_possible_not_done);
            pending_tasks_sema.leave();
            if(completed_tasks >= total_tasks){
                jobQueue.cleanQueue();
            }
        });
    };

    this.failTask = (task_id, task_error) => {
        // Remove from pending tasks
        failed_tasks.push(task_error);
        this.finishTask(task_id);
    };

    this.toJson = () => {
        return {
            command: command,
            total_tasks: total_tasks,
            completed_tasks: completed_tasks
        };
    };

    this.toString = () => {
        return JSON.stringify(this.toJson);
    };

};

module.exports = Job;
