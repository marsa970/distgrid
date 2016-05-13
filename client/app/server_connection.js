var net =  require("net");
var os = require("os");
var protocol = new (require("../../protocol/app/protocol.js"))();

module.exports = function(_address, _port, callback){
    serverConnection = {};

    var address = _address;
    logger.log("Connecting to:", address);
    var port = _port;
    var socket = net.createConnection({host:address,port:port}, function(){
        logger.log("Connected to", address, "on port", port);
        callback();
    });
    var current_message = null;

    serverConnection.register = () => {
        var register_message = new protocol.Register(os.cpus().length, os.totalmem()/1000000);
        socket.write(protocol.toBuffer(register_message));
    };

    serverConnection.taskComplete = (task) => {
        var task_complete_message = new protocol.TaskComplete(task.job, task.task);
        socket.write(protocol.toBuffer(task_complete_message));
    };

    serverConnection.taskError = (task, error) => {
        logger.debug("serverCOnnection sending error:", error);
        var task_error_message = new protocol.TaskError(
            task.job,
            task.task,
            error
        );
        socket.write(protocol.toBuffer(task_error_message));
    };

    serverConnection.taskPreloaded = (preload_task) => {
        var task_preloaded_message = new protocol.TaskPreloaded(
            preload_task.job,
            preload_task.task
        );
        socket.write(protocol.toBuffer(task_preloaded_message));
    };

    serverConnection.taskFinishedLocally = (task) => {
        var task_finished_locally_message = new protocol.TaskFinishedLocally(
            task.job,
            task.task
        );
        socket.write(protocol.toBuffer(task_finished_locally_message));
    };

    var handleMessage = (message) => {
        //console.log("Finished receiving message:", message.toString());
        var json = protocol.toJson(message);
        if( json !== null ){
            switch(json.type){
                case protocol.HEARTBEAT_TYPE:
                    var heartbeat_message = new protocol.Heartbeat(json.id);
                    socket.write(protocol.toBuffer(heartbeat_message));
                    break;
                case protocol.TASK_TYPE:
                    //console.log("Got task:", json.command);
                    logger.debug("Got task", json);
                    taskHandler.handle(json);
                    break;
                case protocol.PRELOAD_TASK_TYPE:
                    logger.debug("Preloading task", json);
                    taskHandler.preload(json);
                    break;
                case protocol.REGISTRATION_DONE_TYPE:
                    logger.log("Registration done, waiting for tasks.");
                    break;
                default:
                    logger.warn("Message discarded, no handler registered for", message.type, ".");
            }
        } else {
            logger.error("Error converting message:", message);
        }
    };

    var handleData = (data) => {
        //console.log("Got data:", data.toString());
        /*
        client.write(data);
        client.end();
        */
        var messages = protocol.messages(current_message, data);
        if( messages.length == 1 ){
            current_message = messages[0];
        } else {
            //console.log("Second part of message", messages[1].toString());
            current_message = null;
            handleMessage( messages [0] );
            remainder_data = messages[1];
            handleData(remainder_data);
        }
    };

    socket.on("data", handleData);

    socket.on("end", () => {
        logger.log("disconnected from server!");
        process.exit(1);
    });

    socket.on("error", (error) => {
        logger.error(error);
        process.exit(1);
    });

    return serverConnection;
}
