"use strict";

/** @constructor */
function RkBuf(mode)
{
    switch (mode) {
        case "Рк":
            this.Check = this.CheckРк;
            this.init = this.initBigend;
            break;
        case "Микроша":
            this.Check = this.CheckМикроша;
            this.init = this.initBigend;
            break;
        case "Специалистъ":
            this.Check = this.CheckСпециалистъ;
            this.init = this.initLittlend;
            break;
    }
}

RkBuf.prototype.initBigend = function(o1, o2, o3, o4)
{
    this.start = (o1 << 8) | o2;
    this.end = (o3 << 8) | o4;
}

RkBuf.prototype.initLittlend = function(o1, o2, o3, o4)
{
    return this.initBigend(o2, o1, o4, o3);
}

RkBuf.prototype.Init = function(o1, o2, o3, o4)
{
    this.init(o1, o2, o3, o4);
    this.count = this.end - this.start + 1;
    this.index = 0;
    if (this.count > 0) {
        this.buf = new Uint8Array(this.count);
    }
    this.csm_hi = this.csm_lo = 0;
    this.cs_hi = this.cs_lo = 0;
}

RkBuf.prototype.Put = function(octet)
{
    if (this.index >= this.count || !this.buf) {
        return false;
    }

    this.buf[this.index] = octet;

    this.cs_lo += octet;
    if (this.index < this.count - 1) {
        this.cs_hi += octet + ((this.cs_lo >> 8) & 0xff);
    }
    this.cs_lo &= 0xff;
    this.cs_hi &= 0xff;

    /* Necrosha checksum */
    if (this.index % 2 === 0) {
        this.csm_lo ^= octet;
    } else {
        this.csm_hi ^= octet;
    }

    ++this.index;

    return this.count - this.index;
}

RkBuf.prototype.CheckРк = function(hi, lo) {
    return this.cs_hi === hi && this.cs_lo === lo;
}

RkBuf.prototype.CheckМикроша = function(hi, lo) {
    return this.csm_hi === hi && this.csm_lo === lo;
}

RkBuf.prototype.CheckСпециалистъ = function(hi, lo) {
    return this.cs_hi === lo && this.cs_lo === hi;
}


/** @constructor */
function FRk(rkbuf, name, maxconfidence)
{
    /* confidence is variable to allow microsha to overrule rk */

    this.FormatName = name;
    this.rk = rkbuf;
    this.maxconfidence = maxconfidence; 
    this.reset();
}

FRk.prototype.reset = function()
{
    this.start = this.end = this.cs = false;
    this.mem = [];
    this.confidence = 0;
    this.state = 0;
    this.s = false;
}

FRk.prototype.Confidence = function()
{
    return this.confidence;
}

FRk.prototype.eatoctet = function(sym, sym_start, sym_end)
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
                ++this.confidence;
                this.dummycount = 0;
                this.buf = new Uint8Array(32);
                this.state = 1;
            }
            break;
        case 1: /* start addr octet 0 */
            this.buf[this.dummycount] = sym;
            ++this.dummycount;
            if (this.dummycount === 4) {
                /* RK: start16, end16 big endian */
                this.rk.Init(this.buf[0], this.buf[1],
                        this.buf[2], this.buf[3]); 

                if (this.rk.count <= 0) {
                    this.reset();
                    resync = true;
                    this.state = 0;
                } else {
                    /* Can only keep on and hope that the checksum adds up */
                    ++this.confidence;
                    this.state = 2;
                }
            }
            break;
        case 2:
            if (this.rk.Put(sym) === 0) {
                this.mem = [];
                for (var i = this.rk.start; i <= this.rk.end; ++i) {
                    this.mem[i] = this.rk.buf[i - this.rk.start];
                }
                this.state = 2.5;
            }
            break; 
        case 2.5:
            this.csm_hibuf = sym;
            this.state = 2.75;
            break;
        case 2.75:
            this.csm_lobuf = sym;
            if (this.rk.Check(this.csm_hibuf, this.csm_lobuf)) {
                this.confidence += 400;
                this.state = 100500;
            } else {
                this.state = 3;
            }
            break;
        case 3:
            if (sym === 0xe6) {
                this.confidence += 100; 
                this.cs_hibuf = this.cs_lobuf = 0;
                this.state = 4;
            }
            break;
        case 4:
            this.cs_hibuf = sym;
            this.state = 5;
            break;
        case 5:
            this.cs_lobuf = sym;
            if (this.rk.Check(this.cs_hibuf, this.cs_lobuf)) {
                this.confidence += 200;
                this.state = 100500;
            } 
            else {
                this.errormsg = "checksum mismatch";
                this.state = 100;
            }
            break;
        case 100:
            break;
        case 100500:
            break;
    }
}

FRk.prototype.dump = function(wav, cas)
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

FRk.prototype.GetDecor = function(cas)
{
    return false;
}

function NewFRk86()
{
    return new FRk(new RkBuf("Рк"), "Радио-86РК", 302);
}

function NewFMicrosha()
{
    return new FRk(new RkBuf("Микроша"), "Микроша", 402);
}

function NewFSpec() {
    return new FRk(new RkBuf("Специалистъ"), "Специалистъ", 402);
}
