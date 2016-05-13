var protocol = new (require("../../protocol/app/protocol.js"))();

/*
Takes a connection object and a meta data object.
The meta-data object:
{
    cores: Number,
    memory: Number
}
*/
var Resource = function(connection){
    this.cores = 0;
    this.memory = 0;
    this.connection = connection;
    this.running_tasks = 0;
    this.finished_tasks_cleanup = 0;
    this.waiting_on_heartbeat = false;
    this.id = 0;
    this.current_message = null;
    this.registration_done = false;
    this.tasks = [];
    this.preloading_tasks = [];
    this.preloaded_tasks = [];

    this.sendHeartbeat = function(){
        var heartbeat_message = new protocol.Heartbeat(this.id);
        this.connection.write(protocol.toBuffer(heartbeat_message));
        this.waiting_on_heartbeat = true;
    };

    var sendTaskToClient = (task) => {
        this.running_tasks++;
        task.finished_on_client = false;
        this.tasks.push(task);
        this.connection.write(protocol.toBuffer(task));
    };

    this.handleTask = (task) => {
        //console.log("Resource", this.id, "appointed handler for task", task);
        if(task.buffering.indexOf(protocol.TASK_PRELOAD_BUFFER) != -1){
            var preload_task = new protocol.PreloadTask(
                task.job,
                task.task,
                task.command,
                task.args[task.input_arg]
            );
            this.preloading_tasks.push(task);
            this.connection.write(protocol.toBuffer(preload_task));
        } else {
            sendTaskToClient(task);
        }
    };

    this.handleTaskPreloaded = (preload_task) => {
        logger.debug("Handling preloaded task", preload_task);
        for( var i = 0; i < this.preloading_tasks.length; i++ ){
            if( this.preloading_tasks[i].job == preload_task.job &&
                this.preloading_tasks[i].task == preload_task.task ){
                var task = this.preloading_tasks.splice(i, 1)[0];
                if(this.cores > this.running_tasks){
                    sendTaskToClient(task);
                    resourcePool.resourceAvailable();
                } else {
                    this.preloaded_tasks.push(task);
                }
                break;
            }
        }
    };

    this.removeTaskFromTaskList = (task_id) => {
        var running_tasks_allready_decremented = false;
        for( var i = 0; i < this.tasks.length; i++ ){
            if(this.tasks[i].task == task_id){
                running_tasks_allready_decremented = this.tasks[i].finished_on_client;
                this.tasks.splice(i, 1);
                break;
            }
        }
        if( !running_tasks_allready_decremented ){
            this.running_tasks--;
        } else {
            this.finished_tasks_cleanup = this.finished_tasks_cleanup > 0 ? this.finished_tasks_cleanup - 1 : 0;
        }
    };

    this.handleTaskComplete = (task) => {
        logger.log("Resource", this.id, "completed task", task);
        this.removeTaskFromTaskList(task.task);
        jobQueue.finishTask(task.job, task.task);
        // Check if preloaded tasks exists and take care of them if they exist
        if( this.preloaded_tasks.length > 0 ){
            var preloaded_task = this.preloaded_tasks.shift();
            sendTaskToClient(preloaded_task);
        } 
        resourcePool.resourceAvailable();
    };

    this.handleTaskFinishedOnCLient = (task) => {
        for(var i = 0; i < this.tasks.length; i++ ){
            if(this.tasks[i].task == task.task){
                this.tasks[i].finished_on_client = true;
                break;
            }
        }
        this.running_tasks--;
        this.finished_tasks_cleanup++;
        jobQueue.finishTaskOnClient(task.job, task.task)
        if( this.cores > this.finished_tasks_cleanup ){
            resourcePool.resourceAvailable();
        }
    };

    this.handleTaskError = (task) => {
        logger.log("Resource", this.id, "reports error on task", task);
        this.removeTaskFromTaskList(task.task);
        jobQueue.failTask(task.job, task.task, task.error);
        resourcePool.resourceAvailable();
    }

    this.handleHeartbeatMessage = (message) => {
        if( message.id == this.id ){
            this.waiting_on_heartbeat = false;
        }
    };

    this.handleRegisterMessage = (message) => {
        this.cores = message.cores;
        this.memory = message.memory;
        this.registration_done = true;
        logger.log(
            "Registration for",
            this.id,
            "done.",
            this.cores,
            " cores and",
            this.memory,
            "MB memory reported.");
        var registration_done_message = new protocol.RegistrationDone(this.id);
        this.connection.write(protocol.toBuffer(registration_done_message));
        resourcePool.resourceAvailable();
    };

    this.handleMessage = (message) => {
        //console.log("Received message from", this.id, "containing", message);
        try{
            switch(message.type){
                case protocol.TASK_COMPLETE_TYPE:
                    this.handleTaskComplete(message);
                    break;
                case protocol.TASK_PRELOADED_TYPE:
                    this.handleTaskPreloaded(message);
                case protocol.TASK_FINISHED_LOCALLY_TYPE:
                    this.handleTaskFinishedOnCLient(message);
                    break;
                case protocol.TASK_ERROR_TYPE:
                    this.handleTaskError(message);
                    break;
                case protocol.HEARTBEAT_TYPE:
                    this.handleHeartbeatMessage(message);
                    break;
                case protocol.REGISTER_TYPE:
                    this.handleRegisterMessage(message);
                    break;
                default:
                    logger.warn("Message discarded, no handler registered for", message.type, ".");
            }
        } catch(error){
            logger.error("Error: Could not handle message", message);
            logger.error("Error:", error);
        }
    };

    this.handleData = (data) => {
        //console.log("Resource id", this.id, "is sending data...");
        var messages = protocol.messages(this.current_message, data);
        if( messages.length == 1 ){
            this.current_message = messages[0];
        } else {
            var remainder_data = messages[1];
            //console.log("Second part of message", messages[1].toString());
            this.handleMessage( protocol.toJson(messages[0]) );
            this.current_message = null;
            this.handleData(remainder_data);
        }
    };

    this.handleEnd = () => {
        logger.warn("Resource id", this.id, "closed the connection, removing from resources.");
        resourcePool.remove(this.id);
    };

    this.handleError = (error) => {
        switch(error.code){
            case "ECONNRESET":
                logger.log("Resource id", this.id, "closed the connection.");
                resourcePool.remove(this.id);
                break;
            default:
                logger.warn("Resource id", this.id, " threw: ", error);
                resourcePool.remove(this.id);
        }
    };

    this.toJson = () => {
        return {
            id: this.id,
            cores: this.cores,
            memory: this.memory,
            running_jobs: this.running_jobs
        };
    };

    this.toString = () => {
        return JSON.stringify(this.toJson());
    };

    this.connection.on("error", this.handleError);

    this.connection.on("data", this.handleData);

    this.connection.on("end", this.handleEnd);

};

module.exports = Resource;
