/** @constructor */
const ZOOM_MIN = 0.02;
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

