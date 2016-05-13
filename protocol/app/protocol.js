var Protocol = function(){
};

// Heartbeat message type
Protocol.prototype.HEARTBEAT_TYPE = "heartbeat";
Protocol.prototype.Heartbeat = function(id){
    this.type = "heartbeat";
    this.id = id;
};

// Register message type
Protocol.prototype.REGISTER_TYPE = "register";
Protocol.prototype.Register = function(cores, memory){
    this.type = "register";
    this.cores = cores;
    this.memory = memory;
};

Protocol.prototype.REGISTRATION_DONE_TYPE = "registration_done";
Protocol.prototype.RegistrationDone = function(resource_id){
    this.type = "registration_done";
    this.id = resource_id;
};

// Task sent to client message type
Protocol.prototype.TASK_TYPE = "task";
Protocol.prototype.TASK_INPUT_BUFFER = "input";
Protocol.prototype.TASK_OUTPUT_BUFFER = "output";
Protocol.prototype.TASK_PRELOAD_BUFFER = "preload";
Protocol.prototype.Task = function(
    job_id,
    task_id,
    command,
    args,
    input_arg,
    output_arg,
    run_with_shell,
    buffering,
    queue_mode,
    queue_output,
    single_client){

    this.type = "task";
    this.job = job_id;
    this.task = task_id;
    this.args = args;
    this.command = command;
    this.input_arg = input_arg;
    this.output_arg = output_arg;
    this.run_with_shell = run_with_shell;
    this.buffering = buffering;
    this.queue_mode = queue_mode;
    this.queue_output = queue_output;
    this.single_client = single_client;
};

Protocol.prototype.PRELOAD_TASK_TYPE = "preload_task";
Protocol.prototype.PreloadTask = function(job_id, task_id, command, file){
    this.type = "preload_task";
    this.job = job_id;
    this.task = task_id;
    this.command = command;
    this.file = file;
};

Protocol.prototype.TASK_PRELOADED_TYPE = "task_preloaded";
Protocol.prototype.TaskPreloaded = function(job_id, task_id){
    this.type = "task_preloaded";
    this.job = job_id;
    this.task = task_id;
};

// Task work completed on client but data not available to server yet
Protocol.prototype.TASK_FINISHED_LOCALLY_TYPE = "task_finished_locally";
Protocol.prototype.TaskFinishedLocally = function(job_id, task_id){
    this.type = "task_finished_locally";
    this.job = job_id;
    this.task = task_id;
};

// Task complete type
Protocol.prototype.TASK_COMPLETE_TYPE = "task_complete";
Protocol.prototype.TaskComplete = function(job_id, task_id){
    this.type = "task_complete";
    this.job = job_id;
    this.task = task_id;
};

Protocol.prototype.TASK_ERROR_TYPE = "task_error";
Protocol.prototype.TaskError = function(job_id, task_id, error_msg){
    this.type = "task_error";
    this.job = job_id;
    this.task = task_id;
    this.error = error_msg;
};

Protocol.prototype.toBuffer = function(json_data){
    return JSON.stringify(json_data) + "\n\n";
};

Protocol.prototype.endAt = function(data_buffer){
    var end_at = -1;
    var found_first_char = false;
    for(var i = 0; i < data_buffer.length; i++ ){
        if( data_buffer[i] === 10 ){
            if (found_first_char) {
                end_at = i + 1;
                break;
            } else {
                found_first_char = true;
            }
        } else {
            found_first_char = false;
        }
    }
    return end_at;
};

Protocol.prototype.messages = function(no_end_buffer, new_buffer){
    var end_at_pos = this.endAt(new_buffer);
    var complete_message = null;
    var next_message = null;

    if( no_end_buffer === null ){
        no_end_buffer = new Buffer(0);
    }
    if( end_at_pos != -1 ){
        complete_message = Buffer.concat([no_end_buffer, new_buffer.slice(0,end_at_pos)]);
        next_message = new_buffer.slice(end_at_pos);
        return [complete_message, next_message];
    } else {
        next_message = Buffer.concat([no_end_buffer, new_buffer]);
        return [next_message];
    }
};

Protocol.prototype.toJson = function(data_buffer){
    var json_data = null;
    try{
        json_data = JSON.parse(data_buffer);
    } catch(error){
        console.log("Protocol: failed to convert to json.");
        console.log("Protocol:", data_buffer);
        if( data_buffer !== undefined && data_buffer !== null){
            console.log("Protocol:", data_buffer.toString());
        }
    }
    return json_data;
};

module.exports = Protocol;
