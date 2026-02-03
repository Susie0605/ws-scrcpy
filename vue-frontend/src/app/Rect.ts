export default class Rect {
    constructor(public readonly left: number, public readonly top: number, public readonly right: number, public readonly bottom: number) { }

    public static equals(a?: Rect | null, b?: Rect | null): boolean {
        if (!a && !b) {
            return true;
        }
        if (!a || !b) {
            return false;
        }
        return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
    }

    public static copy(a?: Rect | null): Rect | null {
        if (!a) {
            return null;
        }
        return new Rect(a.left, a.top, a.right, a.bottom);
    }
}
