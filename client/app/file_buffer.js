var os = require("os");
var fs = require("fs");
var path = require("path");
// Used to remove whole directory trees
var rimraf = require("rimraf");
var protocol = new (require("../../protocol/app/protocol.js"))();
var semaphore = require("semaphore");

module.exports = function(forced_temp_dir){
    fileBuffer = {};

    var TMPDIRPREFIX = "temp-";

    var tmp_dir = path.join(os.tmpdir(), "distgrid");
    if( forced_temp_dir !== null ){
        tmp_dir = forced_temp_dir;
    }

    try{
        logger.debug("Creating temp dir");
        try{
            fs.mkdirSync(tmp_dir);
        } catch(error){
            if(error.code == "EEXIST"){
                if( !fs.statSync(tmp_dir).isDirectory()){
                    throw "File distgrid in path " + tmp_dir + " allready exeists but is not a directory!";
                }
            } else {
                throw error;
            }
        }
        logger.debug("Removing old tmpdirs");
        // Remove old temp directories
        var old_tmp_dirs = fs.readdirSync(tmp_dir);
        old_tmp_dirs.forEach((dir) => {
            var listing = path.join(tmp_dir, dir);
            if(fs.statSync(listing).isDirectory() && dir.indexOf(TMPDIRPREFIX) != -1){
                logger.debug("Deleting", listing);
                rimraf.sync(listing);
            }
        });

        tmp_dir = fs.mkdtempSync(path.join(tmp_dir,TMPDIRPREFIX));
    } catch (error){
        logger.error("Could not create temp dir", error);
        process.exit(1);
    }
    logger.log("Using temp dir", tmp_dir);
    //fs.mkdtemp(tmp_dir)

    var job_dirs_sema = semaphore(1);
    var job_dirs = {};
    var preloading_tasks = [];
    var preloaded_tasks = [];
    var output_queue = [];
    var flushing_output_queue = false;

    var assureJobDir = (prefix, callback) => {
        job_dirs_sema.take(()=>{
            var complete_path = null;
            if(job_dirs[prefix] === undefined){
                fs.mkdtemp(path.join(tmp_dir, prefix), (error, dir) => {
                    if(error){
                        callback(error, null);
                    } else {
                        job_dirs[prefix] = dir;
                        callback(null, dir);
                    }
                    job_dirs_sema.leave();
                });
            } else {
                callback(null, job_dirs[prefix]);
                job_dirs_sema.leave();
            }
        })
    };

    var copyFile = (input_dir, output_dir, filename, callback) => {
        logger.debug("Copying file params", input_dir, output_dir, filename, callback);
        var input_stream = fs.createReadStream(path.join(input_dir,filename));
        input_stream.on("error", callback);
        var output_stream = fs.createWriteStream(path.join(output_dir,filename));
        output_stream.on("error", callback);
        output_stream.on("finish", () => {
            logger.debug("File copy output stream finished.");
            callback(null);
        });
        input_stream.pipe(output_stream);
    };

    var getPrefix = (task) => {
        return "" + task.job + "_" + task.command + "_";
    };

    var checkOutputBuffer = (task, callback) => {
        if( task.buffering.indexOf(protocol.TASK_OUTPUT_BUFFER) != -1){
            fileBuffer.outputBuffer(task, callback);
        } else {
            callback(null, task);
        }
    };

    var emptyOutputQueue = () => {
        if( !flushing_output_queue ){
            flushing_output_queue = true;
            while( output_queue.length > 0 ){
                var queued_task = output_queue.shift();
                var task = queued_task.task;
                var input_dir = path.parse(task.args[task.output_arg]).dir;
                var output_dir = path.parse(task.original_output_path).dir;
                var filename = path.parse(task.original_output_path).base;
                copyFile(input_dir, output_dir, filename, (error) => {
                    if(error){
                        logger.error("Could not finish output buffer.", error);
                    }
                    queued_task.callback(error);
                });
            }
            flushing_output_queue = false;
        }
    };

    fileBuffer.setupTask = (task, callback) => {
        if( task.buffering.indexOf(protocol.TASK_INPUT_BUFFER) != -1){
            fileBuffer.inputBuffer(task, (error, mod_task) => {
                if( error === null || error === undefined ){
                    checkOutputBuffer(mod_task, callback);
                } else {
                    logger.error("Inputbuffer setup failed", error);
                    logger.error(error);
                    callback(error, null);
                }
            });
        } else if( task.buffering.indexOf(protocol.TASK_PRELOAD_BUFFER) != -1){
            checkPreloadBuffer(task, (error, preloaded_task) => {
                if( error ){
                    callback(error, null);
                } else {
                    var mod_task = task;
                    mod_task.args[mod_task.input_arg] = preloaded_task.file;
                    checkOutputBuffer(mod_task, callback);
                }
            });
        } else {
            checkOutputBuffer(task, callback);
        }
    };

    fileBuffer.finishTask = (task, callback) => {
        if( task.buffering.indexOf(protocol.TASK_OUTPUT_BUFFER) != -1){
            if( task.queue_output !== undefined && task.queue_output ){
                output_queue.push({task:task, callback: callback});
                emptyOutputQueue();
            } else {
                var input_dir = path.parse(task.args[task.output_arg]).dir;
                var output_dir = path.parse(task.original_output_path).dir;
                var filename = path.parse(task.original_output_path).base;
                copyFile(input_dir, output_dir, filename, (error) => {
                    if(error){
                        logger.error("Could not finish output buffer.", error);
                    }
                    callback(error);
                });
            }
        } else {
            callback(null);
        }
    };

    /*
    Takes a Protocol.task and redirects its input path
    to a local copy of the file the original path pointed to.
    The callback should take error and the modified task as params.
    */
    fileBuffer.inputBuffer = (task, callback) => {
        var prefix = getPrefix(task);
        assureJobDir(prefix, (error, dir) => {
            if(error){
                logger.warn("Could not create folder for", prefix);
                callback(error, null);
            } else {
                var path_obj  = path.parse(task.args[task.input_arg]);
                var input_dir = path_obj.dir;
                var file_name = path_obj.base;
                copyFile(input_dir, dir, file_name, (error) => {
                    if( error ){
                        logger.debug("Copying file for input buffer failed.");
                        callback(error, null);
                    } else {
                        // Create a modified task with the input param changed t local copy
                        var mod_task = task;
                        mod_task.args[mod_task.input_arg] = path.join(dir, file_name);
                        callback(null, mod_task);
                    }
                });
            }
        });
    };

    fileBuffer.outputBuffer = (task, callback) => {
        var prefix = getPrefix(task);
        assureJobDir(prefix, (error, dir) => {
            if( error ){
                logger.warn("Cloud not create folder for", prefix);
                callback(error, null);
            } else {
                var path_obj = path.parse(task.args[task.output_arg]);
                logger.debug("OP", path_obj);

                var file_name = path_obj.base;
                var mod_task = task;
                mod_task.original_output_path = task.args[task.output_arg];
                mod_task.args[task.output_arg] = path.join(dir, file_name);
                callback(null, mod_task);
            }
        })
    };

    var registerPreloadingTask = (preload_task, callback) => {
        preload_task.waiting = [];
        if( callback !== undefined ){
            preload_task.waiting.push(callback);
        }
        preloading_tasks.push(preload_task);
    };

    var registerPreloadedTask = (preload_task) => {
        for( var i = 0; i < preloading_tasks.length; i++ ){

            if( preloading_tasks[i].job == preload_task.job &&
                preloading_tasks[i].task == preload_task.task ){

                preloading_tasks[i].waiting.forEach(function(cb){
                    cb(null, preloading_tasks[i]);
                });

                preloaded_tasks.push(preloading_tasks[i]);

                preloading_tasks.splice(i, 1);
                break;
            }
        }
    };

    var checkPreloadBuffer = (task, callback) => {
        for(var i = 0; i < preloaded_tasks.length; i++ ){
            if(preloaded_tasks[i].job == task.job && preloaded_tasks[i].task == task.task){
                var preloaded_task = preloaded_tasks.splice(i, 1)[0];
                callback(null, preloaded_task);
                return;
            }
        }
        for( var i = 0; i < preloading_tasks.length; i++ ){
            if(preloading_tasks[i].job == task.job && preloading_tasks[i].taks == task.task){
                preloading_tasks[i].waiting.push(callback);
                logger.debug("Entered waiting list for task.")
                break;
            }
        }
    };

    fileBuffer.preloadBuffer = (preload_task, callback) => {
        registerPreloadingTask(preload_task, callback);
        var prefix = getPrefix(preload_task);
        assureJobDir(prefix, (error, dir) => {
            if( error ){
                logger.warn("Could not create folder for", prefix);
                callback(error, null);
            } else {
                var path_obj = path.parse(preload_task.file);
                copyFile(path_obj.dir, dir, path_obj.base, (error) => {
                    if( error ){
                        callback(error, null);
                    } else {
                        preload_task.file = path.join(dir, path_obj.base);
                        registerPreloadedTask(preload_task);
                    }
                });
            }
        });
    };

    return fileBuffer;
};
