var fs = require("fs");
var util = require("util");
var os = require("os");
var path = require("path");

module.exports = function(level_str, console_output, homedir_folder_name){
    logger = {};

    var LEVELS = ["error","warn","stat","log","debug"];
    var level = LEVELS.indexOf(level_str);
    if( level == -1){
        throw level + " is not a valid level.";
    }

    // Assure folders exeists
    var homedir = os.homedir();
    try{
        fs.mkdirSync(path.join(homedir,homedir_folder_name,"logs"));
    } catch(error){
        if( error.code == "ENOENT" ){
            //homedir_folder_name does not exist, create!
            fs.mkdirSync(path.join(homedir, homedir_folder_name));
            fs.mkdirSync(path.join(homedir, homedir_folder_name, "logs"));
        }
    }

    var OUTPATH = path.join(homedir, homedir_folder_name, "logs");
    var log_file = fs.createWriteStream(path.join(OUTPATH, "log.log"), {flags:"a",autoClose: false});
    var stat_file = fs.createWriteStream(path.join(OUTPATH, "stat.log"),{flags:"a",autoClose: false});
    var OUTPUT_TO_CONSOLE = console_output;

    var handleMessage = (lvl, args) => {
        var msg_str = new Date().toISOString() + " ";
        msg_str += lvl.toUpperCase() + ": ";
        for(var i = 0; i < args.length; i++ ){
            if(typeof args[i] == "string"){
                msg_str += args[i];
            } else {
                if( args[i] !== null ){
                    msg_str += util.inspect(args[i]);
                }
            }
            if( i != args.length - 1){
                msg_str += " ";
            }
        }
        if(OUTPUT_TO_CONSOLE){
            console.log(msg_str);
        }
        switch(lvl){
            case "stat":
                stat_file.write(msg_str + "\n");
                break;
            default:
                log_file.write(msg_str + "\n");
        }
    };

    logger.warn = function(){
        if(level >= 1){
            handleMessage("warn", arguments);
        }
    };

    logger.error = function(){
        if(level >= 0){
            handleMessage("error", arguments);
        }
    };

    logger.stat = function(){
        if(level >= 2){
            handleMessage("stat", arguments);
        }
    };

    logger.log = function(){
        if(level >= 3){
            handleMessage("log", arguments);
        }
    };

    logger.debug = function(){
        if(level >= 4){
            handleMessage("debug", arguments);
        }
    };

    return logger;
}
