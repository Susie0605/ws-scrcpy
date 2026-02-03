export interface SizeInterface {
    width: number;
    height: number;
}

export default class Size {
    constructor(public readonly width: number, public readonly height: number) { }

    public static equals(a?: Size | null, b?: Size | null): boolean {
        if (!a && !b) {
            return true;
        }
        if (!a || !b) {
            return false;
        }
        return a.width === b.width && a.height === b.height;
    }

    public static copy(a?: Size | null): Size | null {
        if (!a) {
            return null;
        }
        return new Size(a.width, a.height);
    }

    public equals(o: Size): boolean {
        return this.width === o.width && this.height === o.height;
    }

    public toString(): string {
        return `Size{width=${this.width}, height=${this.height}}`;
    }

    public intersect(other: Size): Size {
        return new Size(Math.min(this.width, other.width), Math.min(this.height, other.height));
    }

    public rotate(): Size {
        return new Size(this.height, this.width);
    }

    public toJSON(): SizeInterface {
        return {
            width: this.width,
            height: this.height,
        };
    }

    public getHalfSize(): Size {
        return new Size(this.width >>> 1, this.height >>> 1);
    }
}
