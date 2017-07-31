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
    var insync = false;
    var history = [0,0,0,0,0,0,0,0,0];
    var history_head = 0, history_tail = 0;

    for (var i = 0, end = interval_count - 1, abort = false; i < end && !abort;) {
        var ipair = this.cas.getInterval(i);
        switch (ipair) {
            case "SS":
                /* no inversion, advance 2 */
                outbit = bitstate;
                history[history_head] = i;
                i += 2;
                break;
            case "SL":
                /* inversion, advance 1 */
                outbit = bitstate;
                history[history_head] = i;
                i += 1;
                break;
            case "LL":
                /* no inversion, advance 1 */
                bitstate ^= 1;
                outbit = bitstate;
                history[history_head] = i;
                i += 1;
                break;
            case "LS":
                /* inversion advance 2 */
                bitstate ^= 1;
                outbit = bitstate;
                history[history_head] = i;
                i += 2;
                break;
            default:
                abort = true;
                break;
        }
        history_head = history_head + 1 === history.length ? 0 : history_head + 1;
        history[history_head] = i;
        history_tail = history_head + 1 === history.length ? 0 : history_head + 1;
        var s_end = history[history_head];
        var s_start = history[history_tail];

        sym = (sym << 1) | outbit;

        syncbyte = 0377 & ((syncbyte << 1) | outbit);

        if (!insync) {
            if (syncbyte === 0xe6) {
                //console.log("SYNC NOINV");
                sym = 0xe6;
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
                //var s_start = history[history_head];
                //var s_end = history[history_tail];
                insync = !this.format.eatoctet(sym, s_start, s_end);
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
        }
    }
    //this.rawbytes = bytes.slice(0, bytecount);
}
