/* wavwerk is an interface for reading a wav */

/** @constructor */
function Wavwerk(wav)
{
    this.wav = wav;
    this.rewind();
}

Wavwerk.prototype.rewind = function(pos)
{
    if (!pos) {
        this.playhead = 0;
    } else {
        this.playhead = pos;
    }
}

Wavwerk.prototype.next = function()
{
    return this.wav.Data[this.playhead++];
}

Wavwerk.prototype.getValueAt = function(pos) {
    return this.wav.Data[pos];
}

Wavwerk.prototype.eof = function() {
    return this.playhead >= this.wav.Data.length;
}
