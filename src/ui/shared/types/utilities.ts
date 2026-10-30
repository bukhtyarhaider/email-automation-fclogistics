export type Nullable<T> = T | null;
export type ValueOf<T> = T[keyof T];
export type Timer = ReturnType<typeof window.setTimeout>;
export type Dictionary<T> = Record<string, T>;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type Option = { id: string; name: string };
