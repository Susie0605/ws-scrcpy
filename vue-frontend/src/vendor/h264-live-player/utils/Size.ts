/**
 * Represents a 2-dimensional size value.
 */

export default class Size {
    constructor(public width: number, public height: number) { }
    toString() {
        return '(' + this.width + ', ' + this.height + ')';
    }
    getHalfSize() {
        return new Size(this.width >>> 1, this.height >>> 1);
    }
    length() {
        return this.width * this.height;
    }
}
