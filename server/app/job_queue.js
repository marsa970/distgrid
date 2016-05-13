
module.exports = function(){
    jobQueue = {};

    var queue = [];

    var queuedJob = function(id, job){
        this.id = id;
        this.job = job;
    };

    var last_id = 0;
    var getNewId = () => {
        var last_id_is_unique = false;
        while(!last_id_is_unique){
            var cli = last_id;
            for(var i = 0; i < queue.length; i++){
                if(queue[i].id == last_id){
                    last_id = last_id == Number.MAX_SAFE_INTEGER ? 0 : last_id + 1;
                    break;
                }
            }
            last_id_is_unique = cli == last_id;
        }
        return last_id;
    };

    jobQueue.add = (job) => {
        var new_queue_job = new queuedJob(getNewId(),job);
        logger.log("Adding new queued job", new_queue_job);
        queue.push(new_queue_job);
        return new_queue_job;
    };

    jobQueue.getTask = (min_memory, callback) => {
        for( var i = 0; i <  queue.length; i++ ){
            if( min_memory >= queue[i].job.min_memory && queue[i].job.tasksAvailable() ){
                var job_id = queue[i].id;
                queue[i].job.getTask(job_id, callback);
                break;
            }
        }
        callback(null);
    };

    jobQueue.finishTaskOnClient = (job_id, task_id) => {
        for(var i = 0; i < queue.length; i++ ){
            if( queue[i].id == job_id ){
                queue[i].job.finishTaskOnClient(task_id);
                jobQueue.cleanQueue();
                break;
            }
        }
    };

    jobQueue.finishTask = (job_id, task_id) => {
        for(var i = 0; i < queue.length; i++ ){
            if( queue[i].id == job_id ){
                queue[i].job.finishTask(task_id);
                jobQueue.cleanQueue();
                break;
            }
        }
    };

    jobQueue.failTask = (job_id, task_id, task_error) => {
        for( var i = 0; i < queue.length; i++ ){
            if(queue[i].id == job_id){
                queue[i].job.failTask(task_id, task_error);
            }
        }
    };

    jobQueue.empty = () => {
        return queue.length === 0;
    };

    jobQueue.cleanQueue = () => {
        //console.log("Cleaning jobqueue");
        var done_id = null;
        for(var i = 0; i < queue.length; i++){
            if( queue[i].job.done() ){
                done_id = i;
                break;
            }
        }
        if( done_id !== null ){
            logger.log("Removed completed job", done_id);
            queue.splice(done_id, 1);
            if( queue.length === 0){
                logger.log("Nothing left in queue");
                processingManager.jobQueueDone();
            } else {
                jobQueue.cleanQueue();
            }
        }
    };

    jobQueue.toJson = () => {
        var json_data = { queue: [] };
        queue.forEach((job) => {
            var job_json = job.job.toJson();
            job_json.id = job.id;
            json_data.queue.push(job_json);
        });
        return json_data;
    };

    jobQueue.toString = () => {
        return JSON.stringify(jobQueue.toJson());
    };

    return jobQueue;
};
