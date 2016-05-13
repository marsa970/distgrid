var protocol = new (require("../../protocol/app/protocol.js"))();

module.exports = function(){
    processingManager = {};

    processingManager.processing = false;

    var processTask = (task) => {
        resourcePool.handleTask(task, function(task_handled){
            if(task_handled){
                logger.debug("Task have been assigned a handler");
                getTask();
            } else {
                // Waiting for resources to become available
                logger.debug("Waiting on busy resources...");
                resourcePool.waitForResource(function(){
                    processTask(task);
                });
            }
        });
    };


    var getTask = () => {
        if(jobQueue.empty()){
            // Processing done
            processingManager.processing = false;
            logger.log("Processing done!");
        } else {
            jobQueue.getTask(1000, function(task){
                if( task === null ){
                    // On last few tasks and waiting for completion
                    logger.debug("Waiting for completion...");
                    //setTimeout(getTask, 1000);
                    wait_for_completion = true;
                } else {
                    logger.debug("Found task to process...");
                    processTask(task);
                }
            });
        }
    };

    processingManager.jobQueueUpdated = () => {
        if(wait_for_completion){
            wait_for_completion = false;
            getTask();
        }
    };

    processingManager.jobQueueDone = () => {
        processingManager.processing = false;
    }

    processingManager.startProcessing = () => {
        if(processingManager.processing){
            return false;
        } else {
            processingManager.processing = true;
            wait_for_completion = false;
            getTask();
            return true;
        }
    };


    return processingManager;
}
