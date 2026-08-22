import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import schema from "../_shared/schemas/stackdocs-submission-completed-v1.schema.json" with { type: "json" };

const encoder = new TextEncoder();
type ValidationError = { instancePath?: string; keyword?: string };
type Validator = ((value: unknown) => boolean) & { errors?: ValidationError[] | null };
type AjvLike = { compile: (value: unknown) => Validator };
type AjvConstructor = new (options: Record<string, unknown>) => AjvLike;
type AddFormats = (instance: AjvLike) => void;

const Ajv2020 = ((Ajv2020Module as unknown as { default?: AjvConstructor }).default ??
  (Ajv2020Module as unknown as AjvConstructor));
const addFormats = ((addFormatsModule as unknown as { default?: AddFormats }).default ??
  (addFormatsModule as unknown as AddFormats));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

export type StackDocsEnvelope = Record<string, unknown> & {
  event_id: string;
  connection_id: string;
  correlation_id: string;
};

export function validateEnvelope(value: unknown): asserts value is StackDocsEnvelope {
  if (validateSchema(value)) return;
  const first = validateSchema.errors?.[0];
  throw new Error(`schema:${first?.instancePath || "$"}:${first?.keyword || "invalid"}`);
}

export function parseTimestamp(value: string | null, nowMs: number, skewSeconds: number): string {
  if (!value || !/^[0-9]{1,12}$/.test(value)) throw new Error("invalid_timestamp");
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds) || seconds <= 0) throw new Error("invalid_timestamp");
  if (Math.abs(nowMs - seconds * 1000) > skewSeconds * 1000) throw new Error("expired_timestamp");
  return value;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toHex(new Uint8Array(digest));
}

export async function hmacHex(secret: string, timestamp: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${rawBody}`),
  );
  return toHex(new Uint8Array(signature));
}

export function constantTimeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  let mismatch = 0;
  for (let index = 0; index < 64; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function verifyHmac(
  signatureHeader: string | null,
  timestamp: string,
  rawBody: string,
  secrets: string[],
): Promise<boolean> {
  const match = signatureHeader?.match(/^v1=([a-f0-9]{64})$/);
  if (!match || secrets.length === 0) return false;
  let verified = false;
  for (const secret of secrets) {
    const expected = await hmacHex(secret, timestamp, rawBody);
    verified = constantTimeHexEqual(match[1], expected) || verified;
  }
  return verified;
}

export function utf8ByteLength(value: string): number {
  return encoder.encode(value).byteLength;
}
