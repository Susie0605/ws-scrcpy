export class Util {
    public static stringToUtf8ByteArray(str: string): Uint8Array {
        return new TextEncoder().encode(str);
    }

    public static utf8ByteArrayToString(bytes: Uint8Array): string {
        return new TextDecoder().decode(bytes);
    }
}
