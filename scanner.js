/* new Scanner(bpskanalyser, formats[i]).Scan(displayresult); */

/** @constructor */
function Scanner(cas, format)
{
    this.cas = cas;
    this.format = format;
}

Scanner.prototype.Scan = function(result_cb)
{
    this.scan();
    result_cb && result_cb(this);
}

Scanner.prototype.scan = function()
{
    var bitstate = 0;
    var outbit = 0;

    var sym = 0;
    var bitcount = 0;
    var bytecount = 0;

    var syncbyte = 0;

    var interval_count = this.cas.IntervalCount();
    //var bytes = new Uint8Array(interval_count / 8);

    var insync = false;

    var sym_start = 0;

    var history = [0,0,0,0,0,0,0,0];
    var history_head = 0;

    for (var i = 0, end = interval_count - 1, abort = false; i < end && !abort;) {
        history[history_head] = i;
        if (++history_head === 8) history_head = 0;

        var ipair = this.cas.getInterval(i);
        switch (ipair) {
            case "SS":
                /* no inversion, advance 2 */
                outbit = bitstate;
                i += 2;
                break;
            case "SL":
                /* inversion, advance 1 */
                outbit = bitstate;
                i += 1;
                break;
            case "LL":
                /* no inversion, advance 1 */
                bitstate ^= 1;
                outbit = bitstate;
                i += 1;
                break;
            case "LS":
                /* inversion advance 2 */
                bitstate ^= 1;
                outbit = bitstate;
                i += 2;
                break;
            default:
                abort = true;
                break;
        }
        sym = (sym << 1) | outbit;

        syncbyte = 0377 & ((syncbyte << 1) | outbit);

        if (!insync) {
            if (syncbyte === 0xe6) {
                //console.log("SYNC NOINV");
                sym = 0xe6;
                //sym_start = i - 9;
                sym_start = history[history_head];
                bitcount = 7;
                insync = true;
            } 
            else if (syncbyte === 0x19) {
                bitstate ^= 1;
                //console.log("SYNC INV");
                sym = 0xe6;
                bitcount = 7;
                insync = true;
            } 
        } 
        ++bitcount;
        if (bitcount === 8) {
            bytecount++;

            /* use the format sniffers */
            if (insync) {
                insync = !this.format.eatoctet(sym, sym_start, i); 
                if (this.format.errormsg) {
                    console.log("ERROR: ", this.format.FormatName, 
                            this.format.errormsg);
                    if (this.format.errormsg === FORMAT_GAVE_UP) {
                        abort = true;
                    }
                }
                if (!insync) {
                    //console.log("RESYNC by " + this.formats[f].FormatName);
                    i += 16;
                    syncbyte = 0;
                }
                //console.log("Confidence: " + f + "=" + 
                //        this.formats[f].confidence);
            }

            bitcount = 0;
            sym = 0;
            sym_start = i;
        }
    }
    //this.rawbytes = bytes.slice(0, bytecount);
}
