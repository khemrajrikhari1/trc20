import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "trc20s_session";
const MAX_AGE = 60 * 60 * 8; // 8 hours

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to 32+ characters");
  return new TextEncoder().encode(s);
}

export async function createSession(address: string) {
  const token = await new SignJWT({ address })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getSession(): Promise<{ address: string } | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.address === "string" ? { address: payload.address } : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  cookies().delete(COOKIE);
}
