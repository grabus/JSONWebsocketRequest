(function () {

    var token = (function () {
        //1. Try to find html tag <meta name="http_over_websocket_token" content="TOKEN">
        var meta = $('meta[name="http_over_websocket_token"]')

        if (meta) {
            var content = meta.attr('content')

            if (content)
                return content
        }

        function gen () {
            var arr=[]
            for(var i = 0; i < 16; i++) {
                arr.push(String.fromCharCode(65 + Math.floor(Math.random() * 26)))
            }
            return arr.join('')
        }

        //2. Or request url "/http_over_websocket/token"
        $.ajax({
            type: 'GET',
            url: 'http://localhost:3001/http_over_websocket/token'
        })
        .done(function (data) {
            token = data
        })
        .fail(function () {
            //3. Or generate MD5 hash with 16 digits
            token = gen()
        })
    }())

    var SocketTransport = function(params) {
        var self = this,
            uids = {}

        var uid = function () {
            return String.fromCharCode(65 + Math.floor(Math.random() * 26)) + Date.now()
        }

        var socket = this.socket = new io.Socket({
            host: params.host,
            port: params.port
        })

        socket.onPacket = function (packet) {
            if (packet.type != 'message')
                return

            var data = JSON.parse(packet.data),
                id = data.request.metadata.request_id

            uids[id](data)
        }

        var send = function (id, url, method, headers, data) {
            var packet = {
                path: url,
                method: method,
                headers: headers,
                params: {
                    metadata: {
                        request_id: id,
                        http_over_websocket_token: token
                    }
                    // data extends here...
                }
            }

            // TODO: data:data <- what should be the type of data?
            $.extend(packet.params, {data: data})

            socket.packet({
                type: 'message',
                data: JSON.stringify(packet)
            })
        }

        return function (xhr) {
            var id = uid()

            return function (callback) {
                uids[id] = function (data) {
                    callback.call(xhr, data)
                }

                return function (url, method, headers, data) {
                    send(id, url, method, headers, data)
                }
            }
        }
    }

    var JSONWebsocketRequest = function () {
        this._listeners = []

        // Class-level Events Handlers
        var ons = [
            'abort',
            'error',
            'load',
            'loadend',
            'loadstart',
            'progress',
            'readystatechange'
        ]

        for(var i = 0, il = ons.length; i < il; i++) {
            this['on' + ons[i]] = null
        }

        var response = function (data) {
            this.status = data.response.status
            this.statusText = data.response.statusText
            this.response = data.response.body
            this.responseText = JSON.stringify(data.response.body)
            this.responseType = "" // TODO: does it need?
            this.responseXML = null // TODO: does it need?
            this._responseHeaders = data.response.headers

            this.readyState = this.DONE
            this._trigger('readystatechange')
            this._trigger('load')
        }

        this.sender = this.transport(this)(response)
    }

    JSONWebsocketRequest.prototype = {
        // Interface level constants
        UNSENT: 0,
        OPENED: 1,
        HEADERS_RECEIVED: 2,
        LOADING: 3,
        DONE: 4,

        // Public Methods
        abort: function () {
            this._trigger('abort')
            this._aborted = true
        },

        open: function (method, url, async, user, password) {
            this._requestHeaders = {}
            this._url = url || ''
            this._method = method || ''

            // TODO: async is not used yet.
            if (!async)
                async = true

            this._trigger('open')
            this.readyState = this.OPENED
            this._trigger('readystatechange')
        },

        send: function (data) {
            this._isSent()
            this._sent = true

            this._trigger('send')
            this.sender(this._url, this._method, this._requestHeaders, data)

            while (this.readyState + 1 < this.DONE) {
                this.readyState++
                this._trigger('readystatechange')

                if (this._aborted) {
                    return
                }
            }
        },

        overrideMimeType: function (mime) {
            // TODO: what should I do here?
            return mime
        },

        setRequestHeader: function (name, value) {
            this._isSent()
            this._requestHeaders[name]  = value
        },

        getAllResponseHeaders: function () {
            var headers = []
            for (var k in this._responseHeaders)
                headers.push(k + ': ' + this._responseHeaders[k])

            return headers.join('\n')
        },

        getResponseHeader: function getResponseHeader(name) {
            if (name in this._responseHeaders)
                return this._responseHeaders[name]

            return null
        },

        addEventListener: function (name, handler, useCapture) {
            for (var i = 0, il = this._listeners.length; i < il; i++) {
                var listener = this._listeners[i]
                if (listener[0] == name && listener[1] == handler && listener[2] == useCapture) {
                    return
                }
            }

            this._listeners.push([name, handler, useCapture])
        },

        removeEventListener: function (name, handler, useCapture) {
            for (var i = 0, il = this._listeners.length; i < il; i++) {
                var listener = this._listeners[i]
                if (listener[0] == name && listener[1] == handler && listener[2] == useCapture) {
                    this._listeners.splice(i, 1)
                    return
                }
            }
        },

        dispatchEvent: function (event) {
            var eventPseudo = {
                type: event.type,
                target: this,
                currentTarget: this,
                eventPhase: 2,
                bubbles: event.bubbles,
                cancelable: event.cancelable,
                timeStamp: event.timeStamp,
                stopPropagation: function() {},  // There is no flow
                preventDefault: function() {},  // There is no default action
                initEvent: function() {}   // Original event object should be initialized
            }

            // Execute onevent
            if (this['on' + eventPseudo.type]) {
                var on = this['on' + eventPseudo.type],
                    f = on.handleEvent || on
                f.apply(this, [eventPseudo])
            }

            // Execute listeners
            for (var i = 0, il = this._listeners.length; i < il; i++) {
                var listener = this._listeners[i]
                if (listener[0] == eventPseudo.type && !listener[2]) {
                    var f = listener[1].handleEvent || listener[1]
                    f.apply(this, [eventPseudo]);
                }
            }
        },

        _trigger: function (type) {
            this.dispatchEvent({
                type:       type,
                bubbles:    false,
                cancelable: false,
                timeStamp:  new Date().getTime()
            })
        },

        _isSent: function () {
            if (this._sent)
                throw new Error('InvalidStateError http://www.w3.org/TR/XMLHttpRequest/')
        },

        toString: function () {
            return '[object XMLHttpRequest]'
        }
    }

    JSONWebsocketRequest.toString = function() {
        return 'function XMLHttpRequest() { [native code] }'
    }

    JSONWebsocketRequest.setup = function (options) {
        JSONWebsocketRequest.prototype.transport = new SocketTransport(options)

        jQuery.ajaxSettings.xhr = function() {
            try {
                return new JSONWebsocketRequest()
            } catch( e ) {}
        }
    }

    //window.XMLHttpRequest = JSONWebsocketRequest

    JSONWebsocketRequest.setup({
        host: location.hostname,
        port: location.port
    })

}())