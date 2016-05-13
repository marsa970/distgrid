var semaphore = require("semaphore");
var Resource = require("./resource.js");
var EventEmitter = require("events").EventEmitter;
var protocol = new (require("../../protocol/app/protocol.js"))();

module.exports = function(max_preload_per_client){
    resourcePool = {};

    // pool is an array of Resource sorted on id
    var pool = [];
    var last_used_resource = 0;
    var pool_sema = semaphore(1);
    var resource = new EventEmitter();


    var getNewId = function(){
        var new_id = 0;
        for( var i = 0; i < pool.length; i++ ){
            logger.debug("Checking id", i);
            if( pool[i].id != i ){
                new_id = i;
                break;
            }
            new_id++;
        }
        logger.debug("Selected id", new_id);
        return new_id;
    };


    // Takes a new client/resource and registers it in the pool
    resourcePool.createNewResource = function(connection){
        pool_sema.take(function(){
            var id = getNewId();
            var new_resource = new Resource(connection);
            new_resource.id = id;
            pool.push(new_resource);
            pool.sort(function(a, b){return a.id-b.id;});
            pool_sema.leave();
        });
    };

    // pool_sema MUST be taken before using this function
    var removeSeveral = function(ids){
        for( var i = 0; i < pool.length; i++ ){
            if( ids.length === 0 ){
                break;
            }
            var ids_index = ids.indexOf(pool[i].id);
            if( ids_index != -1 ){
                // Remove pending tasks from the resource
                for( var j = 0; j < pool[i].tasks.length; j++ ){
                    var task = pool[i].tasks;
                    jobQueue.failTask(task.job, task.task);
                }
                pool.splice(i, 1);
                ids.splice(ids_index, 1);
            }
        }
    };

    resourcePool.remove = function(id){
        pool_sema.take(function(){
            removeSeveral([id]);
            pool_sema.leave();
        });
    };

    resourcePool.startHeartbeats = function(interval){
        interval = interval === undefined ? 10000 : interval;
        setInterval(function(){
            pool_sema.take(function(){
                var remove_ids = [];

                for( var i = 0; i < pool.length; i++ ){
                    if( pool[i].waiting_on_heartbeat ){
                        logger.log("Client", pool[i].id, "disconnected due to heartbeat timeout.");
                        remove_ids.push(pool[i].id);
                    } else {
                        if( pool[i].registration_done ){
                            pool[i].sendHeartbeat();
                        }
                    }
                }
                removeSeveral(remove_ids);
                pool_sema.leave();
            });
        }, interval);

    };

    resourcePool.get = (id) => {
        for( var i = 0; i < pool.length; i++ ){
            if( pool[i].id == id ){
                return pool[i];
            }
        }
        return null;
    };

    resourcePool.toString = () => {
        var print_obj = [];
        pool.forEach(function(resource){
            print_obj.push(resource.toJson());
        });
        return JSON.stringify({ pool: print_obj });
    };


    var resourceCanHandleNewTask = (index, preload, queue_mode) => {
        if( preload ){
            var r = pool[index].running_tasks;
            var l = pool[index].preloaded_tasks.length;
            var p = pool[index].preloading_tasks.length;
            var cores = pool[index].cores;
            if( cores * 2 > r + l + p &&
                cores > l + p &&
                pool[index].registration_done ){

                // Try to stop piling up downloads
                if( p + l < max_preload_per_client ){
                    logger.debug("Using queue mode set to", max_preload_per_client, "preloads per client.");
                    return true;
                } else {
                    return false;
                }
            } else {
                return false;
            }
        } else {
            if( pool[index].cores > pool[index].running_tasks ){
                return true;
            } else {
                return false;
            }
        }
    };


    /*
    var resourceCanHandleNewTask = (index) => {
        if( pool[index].cores > pool[index].running_tasks &&
            Math.max(1, Math.floor(pool[index].cores / 2)) > pool[index].preloading_tasks.length &&
            pool[index].registration_done ){

            return true;
        } else {
            return false;
        }
    };
    */

    var singleClient = function(task, callback){
        pool_sema.take(function(){
            var handler_found = false;
            if( pool.length > 0 ){
                var preload = task.buffering.indexOf(protocol.TASK_PRELOAD_BUFFER) != -1;
                if( resourceCanHandleNewTask(0,preload, task.queue_mode) ){
                    pool[0].handleTask(task);
                    handler_found = true;
                }
            }
            pool_sema.leave();
            callback(handler_found);
        });
    };

    var allClients = function(task, callback){
        pool_sema.take(function(){
            var handler_found = false;
            var i = pool.length > 1 ? last_used_resource + 1 : 0;
            for(; i < pool.length + last_used_resource; i++ ){
                var index = i % pool.length;
                var preload = task.buffering.indexOf(protocol.TASK_PRELOAD_BUFFER) != -1;
                if( resourceCanHandleNewTask(index,preload, task.queue_mode) ){
                    pool[index].handleTask(task);
                    last_used_resource = index;
                    handler_found = true;
                    break;
                }
            }
            pool_sema.leave();
            callback(handler_found);
        });
    };

    resourcePool.handleTask = function(task, callback){
        if( task.single_client !== undefined && task.single_client ){
            singleClient(task, callback);
        } else {
            allClients(task, callback);
        }
    };

    resourcePool.waitForResource = function(callback){
        resource.once("available", callback);
    };

    resourcePool.resourceAvailable = function(){
        resource.emit("available");
    }

    return resourcePool;
};
