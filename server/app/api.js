var express = require("express");

var http_server = express();
var bodyParser = require("body-parser");

var Job = require("./job.js");

http_server.use(bodyParser.json({limit:"50mb"}));

http_server.get("/", (req, res) => {
    var api_stack = [];
    http_server._router.stack.forEach((r)=>{
        if( r.route !== undefined){
            api_stack.push({
                "path": r.route.path,
                "method": r.route.methods
            });
        }
    })
    res.send(api_stack);
});

http_server.get("/resourcePool", (req, res) => {
    logger.debug("RP:", resourcePool);
    res.send(resourcePool.toString());
});

http_server.get("/resourcePool/:id", (req, res) => {
    var id = req.params.id;
    var resource = resourcePool.get(id);
    if( resource !== null ){
        res.send(resource.toString());
    } else {
        res.sendStatus(404);
    }
});

http_server.get("/jobQueue", (req, res) => {
    res.send(jobQueue.toString());
});

http_server.post("/jobQueue", (req, res) => {
    logger.debug("Body:", req.body);
    var new_job = null;
    try{
        new_job = new Job(req.body);
    } catch (error){
        res.status(500).send(error);
        return;
    }
    var new_queued_job = jobQueue.add(new_job);
    res.send(JSON.stringify(new_queued_job));
});

http_server.post("/startProcessing", (req, res) => {
    logger.log("Starting processing job queue...");
    processingManager.startProcessing();
    res.sendStatus(200);
});

http_server.listen(api_port, () => {
    logger.log("HTTP Server listening on 8080...");
});
