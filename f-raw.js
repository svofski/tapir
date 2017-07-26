/** @constructor */
function FRaw()
{
    this.FormatName = "Raw";
    this.mem = [];
    this.count = 0;
}

FRaw.prototype.Confidence = function()
{
    return 0;
}

FRaw.prototype.eatoctet = function(sym)
{
    this.mem[this.count++] = 0377 & sym;
}

FRaw.prototype.dump = function()
{
    return Util.dump(this.mem, "Raw image");
}

FRaw.prototype.GetDecor = function(cas)
{
    return null;
}
