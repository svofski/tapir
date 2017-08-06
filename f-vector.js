"use strict";

/** @constructor */
function NameBlock(start, count, blocknum, cs0, nb)
{
    this.Start = start || undefined;
    this.Count = count || undefined;
    this.Blocknum = blocknum || undefined;
    this.Checksum = cs0 || undefined;
    this.NameBytes = nb || new Uint8Array(25);
    this.bm = new Blockmap();
}

NameBlock.prototype.Addr = function(sub)
{
    var addr = (this.Start + this.Count - this.Blocknum) << 8;
    if (sub) {
        addr += (sub & 7) << 5;
    }
    return addr;
}

NameBlock.prototype.NameStr = function()
{
    return String.fromCharCode.apply(String, this.NameBytes);
}

/** @constructor */
function FVector()
{
    this.FormatName = "Вектор-06ц";
    this.reset();
}

FVector.prototype.reset = function()
{
    this.confidence = 0;
    this.state = 0;
    this.mem = [];
    this.bm = new Blockmap();
    this.cs0 = 0;
    this.checksum = 0;

    this.NameBlock = undefined;

    this.Block_sym_start = 0;
    this.Block_sym_end = 0;
    this.Sblk_sym_start = 0;
    this.Sblk_sym_end = 0;
}

FVector.prototype.Confidence = function()
{
    return this.confidence;
}

FVector.prototype.eatoctet = function(sym, sym_start, sym_end)
{
    var resync = false;
    this.errormsg = "";
    if (this.confidence < -1000) {
        console.log("Вектор-06ц сдался");
        this.errormsg = FORMAT_GAVE_UP;
        return false;
    }
    switch (this.state) {
        case 0:
            /* waiting for the sync */
            if (sym === 0xe6) {
                ++this.confidence;
                this.state = 1;
                this.dummycount = 0;
                this.Block_sym_start = sym_start;
                this.Block_sym_end = 0;
                this.Sblk_sym_start = sym_end;
                this.Sblk_sym_end = 0;
                this.Sync_start = sym_start;
                this.Sync_end = sym_end;
            }
            break;
        case 1:
            if (sym === 0) {
                /* Name subblock a'coming */
                this.cs0 = 0;
                ++this.confidence;
                this.tmpNameBlock = new NameBlock();
                this.tmpNameBlock.sym_start = sym_start;
                this.BlockBlock = undefined;
                if (++this.dummycount == 4) {
                    this.state = 2;
                    this.dummycount = 0;
                    this.name_sym_start = sym_end;
                }
            } else if ((sym & 0x80) === 0x80 && this.NameBlock) {
                /* Regular payload subblock */
                this.checksum = 0;
                this.checksum += this.sblk = sym;
                this.SblkAddr = this.NameBlock.Addr(sym);
                this.sblk_sym_start = sym_start;
                this.state = 9;
            } else {
                this.confidence -= 100;
                this.errormsg = "Unexpected subblock number: " + Util.hex8(sym);
                this.state = 0;
                resync = true;
            }
            break;
        case 2:
            /* Expect name */
            this.cs0 += this.tmpNameBlock.NameBytes[this.dummycount++] = sym;
            if (this.dummycount === 27) {
                this.state = 3;
                this.name_sym_end = sym_end;
            }
            ++this.confidence;
            break;
        case 3:
            /* High nibble of load address */ 
            this.cs0 += this.tmpNameBlock.Start = sym;
            this.start_sym_start = sym_start;
            ++this.confidence;
            this.state = 4;
            break;
        case 4:
            /* Block count total */
            this.cs0 += this.tmpNameBlock.Count = sym;
            this.count_sym_start = sym_start;
            ++this.confidence;
            this.state = 5;
            break;
        case 5:
            /* Block number */
            this.cs0 += this.tmpNameBlock.Blocknum = sym;
            this.blknum_sym_start = sym_start;
            this.cs0 &= 0xff;
            ++this.confidence;
            this.state = 6;
            break;
        case 6:
            /* END OF NAME SUBBLOCKЪ */
            this.cs0_sym_start = sym_start;
            /* Checksum 0 */
            if (this.cs0 === sym) {
                this.confidence += 100;
                this.NameBlock = this.tmpNameBlock;
                this.bm.Init(null,
                        this.NameBlock.Start * 8, 
                        (this.NameBlock.Start + this.NameBlock.Count - 1) * 8);
            } else {
                this.confidence -= 100;
                this.errormsg = "Nameblock checksum Need=" + Util.hex8(this.cs0) + 
                    " Read=" + Util.hex8(sym);
            }
            this.Sblk_sym_end = sym_end;
            this.state = 0;
            resync = true;
            {
                var nb = this.tmpNameBlock;
                let blknum = nb.Addr(0) >> 5;
                this.bm.Init(blknum);
                /* Push SYNC marking */
                this.bm.Region(blknum, this.Sync_start, this.Sync_end, "sync")
                    .text = "SYNC";
                /* Push BLOCK marking */
                this.BlockBlock = this.bm.Region(blknum, this.Sync_end, 0, "block");
                /* Push main block marking */
                this.bm.Region(blknum, this.Sblk_sym_start, this.Sblk_sym_end,
                        "name", !(this.cs0 === sym))
                    .text = ".00: NAME";
                /* Push name region */
                this.bm.Region(blknum, this.name_sym_start, this.name_sym_end,
                        "section-name", false)
                    .text = nb.NameStr();
                this.bm.Region(blknum, this.start_sym_start, this.count_sym_start,
                        "section-byte-alt", false)
                    .text = "O:" + Util.hex8(nb.Start);
                this.bm.Region(blknum, this.count_sym_start, this.blknum_sym_start,
                        "section-byte-alt", false)
                    .text = "C:" + Util.hex8(nb.Count);
                this.bm.Region(blknum, this.blknum_sym_start, this.cs0_sym_start,
                        "section-byte-alt", false)
                    .text = "#" + Util.hex8(nb.Blocknum);
                this.bm.Region(blknum, this.cs0_sym_start, sym_end,
                        "section-cs0", false).text = "=" + Util.hex8(sym);
            }
            break;
        case 9:
            /* BEGINЪ OF PAYLOAD SUBBLOCK (32 octets) */
            var cs0_tape;
            this.checksum += cs0_tape = sym;
            this.confidence += 100 * (cs0_tape === this.cs0);
            this.state = 10;
            this.dummycount = 0;
            this.blockbuf = new Uint8Array(32);
            this.cs0_sym_start = sym_start;
            this.cs0_sym_end = sym_end;
            break;
        case 10:
            /* Load into temporary buffer */
            this.blockbuf[this.dummycount] = sym;
            this.checksum += sym;
            ++this.dummycount;
            if (this.dummycount == 32) {
                this.state = 11;
            }
            break;
        case 11:
            /* END OF PAYLOAD SUBBLOCKЪ */
            /* Regardless of everything, update block end */
            if (this.BlockBlock) {
                this.BlockBlock.sblk_sym_end = sym_end;
            }
            this.Sblk_sym_end = sym_end;

            let blknum = this.SblkAddr >> 5;
            let checksum_ok = (this.checksum & 0xff) === sym;
            this.bm.Init(blknum);
            if (checksum_ok) {
                this.state = 0;
                this.confidence += 100;
                /* Inform if it's a recovered block */
                if (this.bm.IsFailure(blknum)) {
                    this.errormsg = "Mended broken sblk @" + Util.hex16(this.SblkAddr);
                }
                /* Clear the subblock in the block map */
                this.bm.MarkLoaded(blknum);
                /* Copy into the main memory */
                for (var i = 0; i < 32; ++i) {
                    this.mem[this.SblkAddr + i] = this.blockbuf[i];
                }
            } else {
                this.errormsg = "Payload checksum @" +
                    Util.hex16(this.SblkAddr) + 
                    " sblk=" + Util.hex8(this.sblk) + 
                    " calc=" + Util.hex8(this.checksum & 0xff) +
                    " read=" + Util.hex8(sym);
                this.state = 0;
                this.confidence -= 100;
                /* Only mark as fail if wasn't loaded before */
                if (!this.bm.IsLoaded(blknum)) {
                    this.bm.MarkFailure(blknum, this.checksum & 0xff, sym & 0xff);
                    /* Since there's nothing better, copy what we've got */
                    for (var i = 0; i < 32; ++i) {
                        this.mem[this.SblkAddr + i] = this.blockbuf[i];
                    }
                }
            }

            /* Push SYNC marking */
            this.bm.Region(blknum, this.Sync_start, this.Sync_end, "sync")
                .text = "SYNC";
            /* Push main block marking */
            {
                var pl = this.bm.Region(blknum, this.Sblk_sym_start, 
                        this.Sblk_sym_end, "payload", !checksum_ok);
                pl.variant = this.sblk & 7;
            } 
            /* SBLK marking */
            this.bm.Region(blknum, this.sblk_sym_start, this.cs0_sym_start, 
                    "section-byte-alt")
                .text = "." + Util.hex8(this.sblk);
            /* CS0 marking */
            this.bm.Region(blknum, this.cs0_sym_start, this.cs0_sym_end, "section-cs0")
                .text = "=" + Util.hex8(this.cs0);
            /* For payload text */
            this.bm.Region(blknum, this.cs0_sym_end, this.cs0_sym_end, "text")
                .text = "DATA @" + Util.hex16(this.SblkAddr);
    
            /* Checksum */
            this.bm.Region(blknum, sym_start, sym_end, "section-cs0")
                .text = "+:" + Util.hex8(sym);
            resync = true;
            break;
        case 100500:
            break;
    }
    return resync;
}

FVector.prototype.countSuccess = function()
{
    if (!this.NameBlock) {
        return 0;
    }
   
    var falta = this.bm.CountMissing();
    return 1 - falta / (this.NameBlock.Count * 8);
}

FVector.prototype.dump = function(wav, cas)
{
    if (!this.NameBlock) {
        var rien = document.createElement("pre");
        rien.innerHTML = this.FormatName + " ничего полезного не распознал";
        return rien;
    }
    var happiness = Math.round(this.countSuccess() * 100) + "% ништяк";
    var i0 = "<pre class='dt'>Вектор-06ц decoder result: " +
            happiness + 
            " Confidence: " + this.confidence +
            "</pre><br/>";

    var startaddr = this.NameBlock.Start << 8;
    var endaddr = ((this.NameBlock.Start + this.NameBlock.Count) << 8) - 1;
    var i1 = "<pre class='dt'>Load addresses: " + 
        Util.hex16(startaddr) +
        " through " + Util.hex16(endaddr) +
        "</pre><br/>";
    i1 += "<pre class='dt'>File name: " + this.NameBlock.NameStr() + "</pre><br/>";

    return (function(that) {
        return Util.dump(that.mem, "Вектор-06ц result: " + happiness,
            i0 + i1,
            /* is_valid(addr) */
            function(addr) {
                var blknum = addr >> 5;
                return that.bm.IsLoaded(blknum);
            },
            /* info_cb(addr) */
            function(addr) {
                if ((addr & 0x0f) != 0) return false;
                var blknum = addr >> 5;
                return that.bm.InfoObject(blknum);
            },
            /* infoclick_cb / navigate to */
            function(e) {
                var blknum = parseInt(e.target.getAttribute("blk")) << 3;
                blknum += parseInt(e.target.getAttribute("sblk"));
                var list = that.bm.GetRegions(blknum, "payload");
                if (!list.length) {
                    list = that.bm.GetRegions(blknum, "name");
                }
                var b = list[0];
                if (b) {
                    var iin = b.sblk_sym_start;
                    var out = b.sblk_sym_end;
                    wav.setNeedle(cas.IntervalToSample(iin));
                }
            }
            );
    })(this);
};

FVector.prototype.GetDecor = function(cas)
{
    return this.bm.GetDecor(cas);
}
