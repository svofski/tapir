/** @constructor */
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4;
const ZOOM_EPS = 0.005;

function Wav(name, bytes, filter)
{
    this.name = name;
    this.bytes = bytes;
    this.filter = filter || new Bypass();
    if (!this.processHeader(bytes)) {
        return null;
    }
}

Wav.prototype.attachEvents = function()
{
    (function(that) {
        var set_mouse = function(e) {
                if (e.buttons === 1) {
                    that.setNeedle((e.offsetX - that.wcanvas.width/2) * that.xscale);
                }
            };
        that.ocanvas.onmousemove = set_mouse;
        that.ocanvas.onmousedown = set_mouse;

        /* Mousey nav */
        that.zcanvas.onmousedown = 
            function(e) {
                that.drag_start = e.offsetX;
                that.drag_needle_start = that.needle;
            };
        that.zcanvas.onmouseup = 
            function(e) {
                that.drag_needle_start =  that.drag_start = undefined;
            };
        that.zcanvas.onmouseleave = 
            function(e) {
                that.drag_needle_start = that.drag_start = undefined;
            };
        that.zcanvas.onmousemove = 
            function(e) {
                if (e.buttons === 1) {
                    that.setNeedle(that.needle - e.movementX/that.zoom);
                }
            };

        /* Wheel/scroll zoom same in both overview and detail canvases */
        var wheelzoom = function(e) {
            var delta = e.wheelDelta ? e.wheelDelta/100 : e.detail ? -e.detail : 0;
            //console.log("wheel delta=", delta, e.deltaX, e.deltaY);
            var z = that.zoom + delta;

            if (z < ZOOM_MIN) z = ZOOM_MIN;
            if (z > ZOOM_MAX) z = ZOOM_MAX;
            if (Math.abs(z - that.zoom) > ZOOM_EPS) {
                that.setZoom(z);
            }
            return e.preventDefault() && false;
        };
        that.zcanvas.addEventListener("mousewheel", wheelzoom, false);
        that.ocanvas.addEventListener("mousewheel", wheelzoom, false);

        /* Touchy nav, scrolling with a finger */
        that.zcanvas.addEventListener("touchstart", function(e) {
                //console.log("touchstart x=", e.targetTouches[0].clientX);
                that.drag_start = e.targetTouches[0].clientX;
                that.drag_needle_start = that.needle;
            }, false);
        that.zcanvas.addEventListener("touchend", function(e) {
                that.drag_start = that.drag_needle_start = undefined;
            }, false);
        that.zcanvas.addEventListener("touchmove", function(event) {
            // If there's exactly one finger inside this element
            if (event.targetTouches.length == 1) {
                var touch = event.targetTouches[0];
                if (that.drag_start) {
                    that.setNeedle(that.drag_needle_start - 
                            (touch.clientX - that.drag_start) / that.zoom );
                }
            }
        }, false);
    })(this);
}

Wav.prototype.setZoom = function(zoom)
{
    this.zoom = zoom;

    window_width = Math.round(this.zcanvas.width / this.xscale / this.zoom);

    this.wcanvas.width = window_width;
    this.wcanvas.style.width = this.wcanvas.width + "px";
    this.paintZoom();
}

Wav.prototype.setNeedle = function(position) 
{
    this.needle = position;

    this.wcanvas.style.left = (position - this.wcanvas.width/2)/this.xscale + "px";
 
    this.paintZoom();
}

Wav.prototype.Decorate = function(decor)
{
    this.decor = decor;
    this.paintOverview();
}

Wav.prototype.decorHeight = function(nest)
{
    var h = 1.0;
    switch (nest) {
        case 0: h = 1.0; break; /* SYNC */
        case 1: h = 0.9; break; /* Block container */
        case 2: h = 0.8; break; /* Block contents (name, subblock) */
        case 3: h = 0.7; break; /* Subparts (e.g. checksum) */
        case 4: h = 0.6; break; /* Subparts (e.g. checksum) */
        default: 
                h = 0.5; break;  /* wtf */
    }
    return h;
}

Wav.prototype.paintZoom = function()
{
    var start = Math.trunc(this.needle);
    var n = start;
    var far_right = start + Math.trunc(this.zcanvas.width / this.zoom);
    var c = this.zbctx;

    var mid_y = this.zcanvas.height / 2;
    var half_scale = mid_y/2;

    c.globalAlpha = 1.0;
    c.strokeStyle = "#fff";
    c.fillStyle = "#000"; //"#142";
    c.fillRect(0, 0, this.zcanvas.width, this.zcanvas.height);

    if (this.decor) {
        var decor = this.decor;
        for (var i = 0; i < decor.length; ++i) {
            var left = decor[i].begin;
            var right = decor[i].end;
            if (right < n || left > far_right) {
                continue;
            }
            var h = this.decorHeight(decor[i].nest);
            c.fillStyle = decor[i].color || Util.randomColor();
            var xleft = left - start;
            c.fillRect(xleft * this.zoom, 0, 
                    (right - left) * this.zoom, 
                    this.zcanvas.height * h);

            if (decor[i].text) {
                c.font = "10px monospace";
                c.fillStyle = "#fff";
                c.fillText(decor[i].text, xleft * this.zoom, 10);
            }
        }
    }

    c.globalAlpha = 0.4;
    c.beginPath();

    for (var i = 0, step = this.zoom; i < this.zcanvas.width; i += step) {
        var samp = this.Data[n++];
        var y = samp * this.yscale * half_scale + mid_y;
        if (i === 0) {
            c.moveTo(i, y);
        } else {
            c.lineTo(i, y);
        }
    }
    c.stroke();

    this.zctx.drawImage(this.zbcanvas, 0, 0, this.zcanvas.width, 
            this.zcanvas.height);
}

Wav.prototype.paintOverview = function()
{
    if (!this.octx || !this.pekkas) return;

    var ctx = this.octx;

    var width = this.ocanvas.width;
    var height = this.ocanvas.height;

    ctx.globalAlpha = 1.0;
    ctx.fillStyle = "#000"; //"#142";
    ctx.fillRect(0, 0, width, height);

    if (this.decor) {
        var decor = this.decor;
        for (var i = 0; i < decor.length; ++i) {
            var left = decor[i].begin / this.xscale;
            var right = (decor[i].end - decor[i].begin) / this.xscale;
            var h = this.decorHeight(decor[i].nest);
            ctx.fillStyle = decor[i].color || Util.randomColor();
            ctx.fillRect(left, 0, right, height * h);
        }
    }

    ctx.globalAlpha = 0.4;

    ctx.strokeStyle = "#fff";
    ctx.beginPath();
    for (var x = 0; x < width; ++x) {
        ctx.moveTo(x, height);
        ctx.lineTo(x, height - height * this.pekkas[x] * this.yscale);
    }
    ctx.stroke();
}

Wav.prototype.buildPeaks = function()
{
    this.ocanvas.width = window.innerWidth;
    this.ocanvas.height = 64;
    this.octx = this.ocanvas.getContext("2d");
    this.octx.translate(0.5, 0.5);

    this.zcanvas.width = window.innerWidth;
    this.zcanvas.height = 64;
    this.zctx = this.zcanvas.getContext("2d");

    this.wcanvas.width = 32;
    this.wcanvas.height = 64;
    this.wctx = this.wcanvas.getContext("2d");

    /* buffer canvas for zoom view */
    this.zbcanvas = document.createElement("canvas");
    this.zbcanvas.width = this.zcanvas.width;
    this.zbcanvas.height = this.zcanvas.height;
    this.zbctx = this.zbcanvas.getContext("2d");
    this.zbctx.translate(0.5, 0.5);

    this.pekkas = new Float32Array(this.ocanvas.width);
    var pidx = 0;

    var val = 0;
    var n = 0;
    var end = this.Data.length;
    var width = this.ocanvas.width;
    var height = this.ocanvas.height;
    var ratio = width / end;
    var max = -1;

    for (var i = 0; i < end; ++i) {
        val += Math.abs(this.Data[i]); ++n;
        var next = Math.trunc(i * ratio);
        if (next > pidx) {
            this.pekkas[pidx] = val / n;
            if (this.pekkas[pidx] > max) {
                max = this.pekkas[pidx];
            }
            n = val = 0;
            pidx = next;
        }
    }

    this.paintOverview();
   
    this.zoom = 1;

    var window_width;
    window_width = Math.round(this.zcanvas.width * ratio / this.zoom);
    if (window_width < 32) {
        this.zoom = this.zcanvas.width * ratio / 32; 
        if (this.zoom < 0.33) this.zoom = 0.33;
        window_width = Math.round(this.zcanvas.width * ratio / this.zoom);
    }

    this.yscale = 1 / max;
    this.xscale = 1 / ratio;

    this.wcanvas.width = window_width;
    this.wcanvas.style.width = this.wcanvas.width + "px";

    this.setNeedle(0);
}

Wav.prototype.processHeader = function(bytes)
{
    var sptr = 0;

    var chunkid = String.fromCharCode.apply(String, bytes.slice(sptr, sptr+=4));
    if (chunkid !== "RIFF") return null;

    var globsize = new Uint32Array(bytes.slice(sptr, sptr+=4).buffer, 0, 1)[0];

    var wave = String.fromCharCode.apply(String, bytes.slice(sptr, sptr+=4));
    if (wave !== "WAVE") return null;

    var fmtid = String.fromCharCode.apply(String, bytes.slice(sptr, sptr+=4));
    if (fmtid !== "fmt ") return null;

    var subchunk1size = new Uint32Array(bytes.slice(sptr, sptr+=4).buffer, 0, 1)[0];
    console.log("fmt subchunk size=", subchunk1size);
    var nextchunk = sptr + subchunk1size;

    var audioformat = new Uint16Array(bytes.slice(sptr, sptr+=2).buffer, 0, 1)[0];
    console.log("Audio Format = ", audioformat);

    if (audioformat !== 1) return null;

    this.NumChannels = new Uint16Array(bytes.slice(sptr, sptr+=2).buffer, 0, 1)[0];
    this.SampleRate = new Uint32Array(bytes.slice(sptr, sptr+=4).buffer, 0, 1)[0];
    this.ByteRate = new Uint32Array(bytes.slice(sptr, sptr+=4).buffer, 0, 1)[0];
    this.BlockAlign = new Uint16Array(bytes.slice(sptr, sptr+=2).buffer, 0, 1)[0];
    this.BitsPerSample = new Uint16Array(bytes.slice(sptr, sptr+=2).buffer, 0, 1)[0];
    
    console.log("Channels: ", this.NumChannels);
    console.log("SampleRate: ", this.SampleRate);
    console.log("ByteRate: ", this.ByteRate);
    console.log("BlockAlign: ", this.BlockAlign);
    console.log("BitsPerSample: ", this.BitsPerSample);
    console.log("sptr=", sptr, " nextchunk=", nextchunk);

    var chunk2id, chunk2sz;
    for (;;) {
        sptr = nextchunk;
        chunk2id = String.fromCharCode.apply(String, bytes.slice(sptr, sptr+=4));
        chunk2sz = new Uint32Array(bytes.slice(sptr, sptr+=4).buffer, 0, 1)[0];
        nextchunk = sptr + chunk2sz;
        console.log("Chunk id: [", chunk2id, "] Length: ", chunk2sz);
        if (chunk2id === "data") {
            var rawdata;
            switch (this.BitsPerSample) {
                case 8:
                    rawdata = bytes.slice(sptr, nextchunk);
                    this.Data = new Int16Array(chunk2sz / this.NumChannels);
                    this.mergeStereo_u8(this.Data, rawdata);
                    break;
                case 16:
                    this.Data = new Int16Array(chunk2sz / 2 / this.NumChannels);
                    rawdata = new Int16Array(bytes.slice(sptr, nextchunk).buffer,
                            0, chunk2sz/2);
                    this.mergeStereo_i16(this.Data, rawdata);
                    break;
                case 32:
                    this.Data = new Int16Array(chunk2sz / 4 / this.NumChannels);
                    var slice = bytes.slice(sptr, nextchunk);
                    rawdata = new Int32Array(slice.buffer, 0, slice.length / 4);
                    this.mergeStereo_i32(this.Data, rawdata);
                    break;
                default:
                    console.log("Unsupported bits per sample:", this.BitsPerSample);
                    break;
            }
            return this.Data !== undefined;
        }
    }
    return false;
}

Wav.prototype.mergeStereo_u8 = function(dst, src)
{
    for (var i = 0, o = 0; i < src.length;) {
        var y = (src[i++] - 128) * 256;
        if (this.NumChannels === 2) {
            y += (src[i++] - 128) * 256;
            y /= 2;
        }
        this.Data[o++] = Math.round(this.filter.filter(y));
    }
}

Wav.prototype.mergeStereo_i16 = function(dst, src)
{
    for (var i = 0, o = 0; i < src.length;) {
        var y = src[i++];
        if (this.NumChannels === 2) {
            y += src[i++];
            y /= 2;
        }
        this.Data[o++] = Math.round(this.filter.filter(y));
    }
}

Wav.prototype.mergeStereo_i32 = function(dst, src)
{
    for (var i = 0, o = 0; i < src.length;) {
        var y = src[i++];
        if (this.NumChannels === 2) {
            y += src[i++];
            y /= 2;
        }
        this.Data[o++] = Math.round(this.filter.filter(y / 65536));
    }
}

