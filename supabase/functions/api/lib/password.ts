/** Lazy bcryptjs for signup/login — avoids heavy load at cold start until needed. */
export async function bcryptHash(password: string): Promise<string> {
  const bcryptjs = await import("https://esm.sh/bcryptjs@2.4.3");
  return await bcryptjs.default.hash(password, 10);
}

export async function bcryptCompare(password: string, hash: string): Promise<boolean> {
  const bcryptjs = await import("https://esm.sh/bcryptjs@2.4.3");
  return await bcryptjs.default.compare(password, hash);
}
