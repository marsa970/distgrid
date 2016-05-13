var http = require("http");
var fs = require("fs");
var serve_file = "../static/watcher.html";

var server = http.createServer((req, res) => {
    if(req.url == "/jobQueue"){
        http.get("http://localhost:8080/jobQueue", (remote_res) => {
            remote_res.on("data", (chunk) => {
                res.write(chunk);
            });
            remote_res.on("error", (error) => {
                console.log(error);
                res.writeHead(500, {});
                res.end();
            })
            remote_res.on("end", () => {
                res.end();
            });
        })
    } else {
        res.writeHead(200, {
            "Content-Type": "text/html",
            "Access-Control-Allow-Origin": "http://localhost:8000",
            "Access-Control-Allow-Origin": "http://192.168.1.4:8000"
        });
        res.end(fs.readFileSync(serve_file));
    }

});
server.on("clientError", (err, socket) => {
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});
server.listen(8000);
console.log("Listening on 8000");
