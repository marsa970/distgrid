
var config = null;
var server_address = null;
var server_port = null;
var log_level = null;
var log_to_console = null;
var use_tmp_dir_default = true;
var alternative_tmp_dir = null;

config = require("./config.json");
server_address = config.server.address;
server_port = config.server.port;
log_level = config.logging.level;
log_to_console = config.logging.output_to_console;
use_tmp_dir_default = config.temporary_files.default;

var logger = require("../../logger/app/logger.js")(log_level, log_to_console, ".distgrid-client");

if( !use_tmp_dir_default ){
    alternative_tmp_dir = config.temporary_files.directory;
}

var fileBuffer = require("./file_buffer.js")(alternative_tmp_dir);

var connectionEstablished = function(){
    serverConnection.register();
};

var taskHandler = require("./task_handler.js")();
var serverConnection = require("./server_connection.js")(
    server_address,
    server_port,
    connectionEstablished
);
