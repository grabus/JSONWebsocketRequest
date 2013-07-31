var app = require('http').createServer(handler)
    , io = require('socket.io').listen(app)
    , fs = require('fs')

app.listen(1337);

function handler (req, res) {
    fs.readFile(__dirname + '/index.html',
        function (err, data) {
            if (err) {
                res.writeHead(500);
                return res.end('Error loading index.html');
            }

            res.writeHead(200);
            res.end(data);
        });
}

io.sockets.on('connection', function (socket) {
    socket.on('message', function (data) {
        var data = JSON.parse(data)
        var packet = {
            request: {
                path: '/some/url',
                metadata: {
                    request_id: data.params.metadata.request_id,
                    http_over_websocket_token: data.params.metadata.http_over_websocket_token
                }
            },
            response: {
                status: '200',
                statusText: 'OK',
                body: {'for': 'example', 'key': 'value'
                    // temporary
                    , 'name': data.params.data,'data': data.params.metadata.request_id
                },
                headers: {
                    // temporary
                    "Date": "Mon, 29 Jul 2013 16:45:32 GMT",
                    "Content-Encoding": "gzip",
                    "X-Content-Type-Options": "nosniff",
                    "Last-Modified": "Sun, 28 Jul 2013 22:49:14 GMT",
                    "Server": "GSE",
                    "ETag": "fdf40d69-b313-4950-9b63-89def9e98125",
                    "Content-Type": "text/html; charset=UTF-8",
                    "Cache-Control": "private, max-age=0",
                    "Content-Length": "31942",
                    "X-XSS-Protection": "1; mode=block",
                    "Expires": "Mon, 29 Jul 2013 16:45:32 GMT"
                }
            }
        }
        socket.packet({
            type: 'message',
            data: JSON.stringify(packet)
        })
    });

});

var connect = require('connect');
connect.createServer(connect.static(__dirname)).listen(1336);