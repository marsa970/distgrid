var childProcess = require("child_process");
var fileBufffer = require("./file_buffer.js");
var protocol = new (require("../../protocol/app/protocol.js"))();

module.exports = function(){
    taskHandler = {};

    var postProcessTask = (task, error) => {
        if( error === undefined || error === null){
            logger.debug("Completed task locally:", task);
            if( task.buffering.indexOf(protocol.TASK_OUTPUT_BUFFER) != -1){
                serverConnection.taskFinishedLocally(task);
                fileBuffer.finishTask(task, (error) => {
                    if( error !== null ){
                        serverConnection.taskError(task);
                    } else {
                        serverConnection.taskComplete(task);
                    }
                });
            } else {
                serverConnection.taskComplete(task);
            }
        } else {
            logger.error(error);
            serverConnection.taskError(task, error);
        }
    };

    var runInShell = (task) => {
        var command = task.command;
        task.args.forEach((arg)=>{
            command += " " + arg;
        })
        logger.debug("Running in shell:", task);
        var child = childProcess.exec(command, (error, stdout, stderr) => {
            postProcessTask(task, error);
        });
    };

    var runWithoutShell = (task) => {
        logger.debug("Running without shell:", task);
        var child = childProcess.execFile(task.command,task.args, (error, stdout, stderr) => {
            postProcessTask(task, error);
        });
    };

    var run = (task) => {
        try{
            if(task.run_in_shell){
                runInShell(task);
            } else {
                runWithoutShell(task);
            }
        } catch(error){
            logger.debug("Run failed.");
            serverConnection.taskError(task, error);
        }
    }

    taskHandler.handle = (task) => {
        if(task.buffering.length > 0){
            fileBuffer.setupTask(task, (error, mod_task) => {
                if( error ){
                    logger.error("Task:", mod_task, "message", error);
                    serverConnection.taskError(task, error);
                } else {
                    run(mod_task);
                }
            });
        } else {
            run(task);
        }
    };

    taskHandler.preload = (preload_task) => {
        logger.debug("Taskhandler preloading task", preload_task);
        fileBuffer.preloadBuffer(preload_task, (error) => {
            if( error ){
                serverConnection.taskError(preload_task, error);
            } else {
                logger.debug("Taskhandler preloaded", preload_task);
                serverConnection.taskPreloaded(preload_task);
            }
        });
    };

    /*
    old handler before fileBuffer.setupTask existed
    taskHandler.handle = (task) => {
        //console.log("Handling task", task);
        if( task.buffering.indexOf(protocol.TASK_INPUT_BUFFER) != -1){
            fileBuffer.inputBuffer(task, function(error, mod_task){
                if(error){
                    serverConnection.taskError(task, error);
                } else {
                    run(mod_task);
                }
            });
        } else {
            run(task);
        }
    };
    */

    return taskHandler;
};
