"use strict";

/** @constructor */
function FVectorCsave()
{
    this.FormatName = "Вектор-06ц CAS";
    this.confidence = 0;
    this.maxconfidence = 350;
    this.reset();
}

FVectorCsave.prototype.reset = function()
{
    this.confidence = 0;
    this.mem = [];
    this.count = 0;
    this.state = 0;
    this.bm = new Blockmap();
    this.bm.Init(0);
    this.FileName = "";
}

FVectorCsave.prototype.Confidence = function()
{
    return this.confidence;
}

FVectorCsave.prototype.eatoctet = function(sym, sym_start, sym_end)
{
    var resync = false;
    this.errormsg = false;
    if (this.confidence < -1000) {
        this.errormsg = FORMAT_GAVE_UP;
        return false;
    }
    switch (this.state) {
        case 0: /* waiting for the sync */
            if (sym === 0xe6) {
                this.confidence = 0;
                this.dummycount = 0;
                this.buf = new Uint8Array(32);
                this.state = 1;

                this.Header_sym_start = sym_end;
                this.Header_sym_end  = 0;
                this.Name_sym_start = -1;
                this.Name_sym_end = 0;

                this.bm.Region(0, sym_start, sym_end, "sync")
                    .text = "SYNC";

                this.bytemarks = [];
            }
            break;
        case 1: /* CAS header magic: D3 D3 D3 D3 */
            if (sym === 0xd3) {
                this.bytemarks[this.dummycount] = [sym_start, sym_end];
                ++this.dummycount;

                if (this.dummycount == 4) {
                    this.confidence += 100;
                    this.state = 2;
                }
            } else {
                this.confidence = -1001;
            }
            break;
        case 2: /* file name */
            ++this.dummycount;
            if (this.Name_sym_start == -1) {
                this.Name_sym_start = sym_start;
            }
            this.FileName += String.fromCharCode(sym)
            if (this.FileName.length >= 128) {
                this.confidence = -1001;
            }
            if (sym === 0x0) {
                this.dummycount = 0;
                this.state = 3;
            } else {
                this.Name_sym_end = sym_end;
            }
            break;
        case 3: /* end of header */
            this.Header_sym_end = sym_start;
            if (sym === 0x0) {
                ++this.dummycount;
                if (this.dummycount == 3) {
                    this.state = 4;
                    this.confidence += 50;
                }
            }
        case 4: /* mid-leader */
            this.Header_sym_end = sym_start;

            if (sym === 0x55) {
                this.state = 5;

                /* create the header block */
                this.bm.Region(0, this.Header_sym_start, this.Header_sym_end,
                    "block");
                this.bm.Region(0, this.Header_sym_start, this.Name_sym_end,
                    "name");
                for (var i = 0; i < this.bytemarks.length; ++i) {
                    this.bm.Region(0, this.bytemarks[i][0], 
                        this.bytemarks[i][1], "section-byte-alt").text = "D3";
                }
                this.bm.Region(0, this.Name_sym_start, this.Name_sym_end,
                    "section-name").text = this.FileName;
            }
            break;
        case 5:
            if (sym === 0xe6) {
                this.bm.Region(0, sym_start, sym_end, "sync")
                    .text = "SYNC";
                this.bytemarks = [];
                this.state = 6;
                this.dummycount = 0;
            }
            break;
        case 6: /* CAS body magic: D3 D3 D3 00 */
            if (sym === 0xd3) {
                this.bytemarks[this.dummycount] = [sym_start, sym_end, sym];
                ++this.dummycount;

                if (this.dummycount == 3) {
                    this.confidence += 150;
                    this.state = 7;
                }
            }
            break;
        case 7:  /* pre-payload */
            if (sym === 0) {
                this.bytemarks[this.dummycount] = [sym_start, sym_end, sym];
                ++this.dummycount;

                this.bm.Init(1);
                this.Blocknik = this.bm.Region(1, this.bytemarks[0][0],
                    0, "block");

                for (var i = 0; i < this.bytemarks.length; ++i) {
                    this.bm.Region(1, this.bytemarks[i][0], 
                        this.bytemarks[i][1], "section-byte-alt").text = 
                            Util.hex8(this.bytemarks[i][2]);
                }
 
                this.bytemarks = [];
                this.dummycount = 0;
                this.checksum = 0;
                this.state = 8; // payload begins
            }
            break;
        case 8: /* payload */
            this.mem[this.count++] = sym;
            this.checksum = 0xffff & (this.checksum + sym);
            if (sym === 0) {
                this.bytemarks[this.dummycount] = [sym_start, sym_end, sym];
                ++this.dummycount; 
                if (this.dummycount === 3) {

                    this.count -= 3; // exclude trailing zeroes from the payload
                    this.mem.splice(this.count, 3);

                    this.Blocknik.sblk_sym_end = sym_end;
                    this.state = 9; // end
                    this.dummycount = 0;

                    for (var i = 0; i < this.bytemarks.length; ++i) {
                        this.bm.Region(1, this.bytemarks[i][0], 
                            this.bytemarks[i][1], "section-byte-alt").text = 
                                Util.hex8(this.bytemarks[i][2]);
                    }
                }
            } else {
                // not three zeroes in a row, reset state
                this.dummycount = 0;
                this.bytemarks = [];
            }
            break;
            
        case 9: /* checksum */
            console.log("czech sum=", Util.hex16(this.checksum));
            this.bytemarks[this.dummycount] = [sym_start, sym_end, sym];
            ++this.dummycount;
            if (this.dummycount === 2) {
                this.Blocknik.sblk_sym_end = sym_end;
                this.state = 100; // end;

                this.bm.Region(1, this.bytemarks[0][0], this.bytemarks[0][1], 
                    "section-cs0").text = Util.hex8(this.bytemarks[0][2]);
                this.bm.Region(1, this.bytemarks[1][0], this.bytemarks[1][1], 
                    "section-cs1").text = Util.hex8(this.bytemarks[1][2]);

                let cs = this.bytemarks[0][2] + (this.bytemarks[1][2] << 8);
                if (this.checksum === cs) {
                    this.confidence += 100;
                } else {
                    this.confidence -= 33;
                    this.errormsg = "Checksum mismatch: read=" + 
                        Util.hex16(cs) + " actual=" + Util.hex16(this.checksum);
                }
            }
        case 10: /* end of header */
            
 
        case 100:
            break;
        case 100500:
           break;
    }
}

FVectorCsave.prototype.dump = function(wav, cas)
{
    return (function(that) {
        return Util.dump(that.mem, that.FormatName + ": " + 
                that.confidence/that.maxconfidence*100 + "%",
                false,
                /* is_valid(addr) */
                null,
                /* info_cb(addr) */
                null,
                /* navigate to */
                null);
    })(this);
}

FVectorCsave.prototype.GetDecor = function(cas)
{
    return this.bm.GetDecor(cas);
}


