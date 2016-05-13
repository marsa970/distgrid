var config = null;
var log_level = null;
var log_to_console = null;
api_port = null;
var server_port = null;
try{
    config = require("./config.json");
    log_level = config.logging.level;
    log_to_console = config.logging.output_to_console;
    api_port = config.api.port;
    server_port = config.distgrid.port;
    max_preload_per_client = config.distgrid.max_preload_per_client;
} catch(error){
    console.log("Error reading config file...");
    console.log(error);
    process.exit(1);
}
var logger = require("../../logger/app/logger.js")(log_level, log_to_console, ".distgrid-server");

var protocol = new (require("../../protocol/app/protocol.js"))();
logger.log("Starting Distgrid server...");

// Extarnal dependecies
var net = require("net");
// Internal imports
var resourcePool = require("./resource_pool.js")(max_preload_per_client);
var jobQueue = require("./job_queue.js")();
var processingManager = require("./processing_manager.js")();

var dist_server = net.createServer(function(client){
    logger.log("Client connected");
    resourcePool.createNewResource(client);
});

dist_server.on("error", function(error){
    throw error;
});

dist_server.listen(server_port, function(){
    logger.log("Server bound");
    resourcePool.startHeartbeats(5000);
});

require("./api.js");
