import { NextResponse } from "next/server";
import { pool } from "@/lib/db-server";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const client = await pool.connect();
    try {
      const res = await client.query(
        'SELECT id, email, password, name, role, assigned_number, created_at FROM "users" WHERE "email" = $1 LIMIT 1',
        [email.trim().toLowerCase()]
      );

      if (res.rows.length === 0) {
        return NextResponse.json(
          { error: "Invalid email or password" },
          { status: 401 }
        );
      }

      const user = res.rows[0];

      // Verify bcrypt password or fallback to plain text if migrated from legacy
      let isValid = false;
      if (user.password.startsWith("$2a$") || user.password.startsWith("$2b$")) {
        isValid = bcrypt.compareSync(password, user.password);
      } else {
        // Legacy plain text check: if matches, automatically upgrade to bcrypt hash
        if (user.password === password) {
          isValid = true;
          const hashed = bcrypt.hashSync(password, 10);
          await client.query('UPDATE "users" SET "password" = $1 WHERE "id" = $2', [
            hashed,
            user.id,
          ]);
        }
      }

      if (!isValid) {
        return NextResponse.json(
          { error: "Invalid email or password" },
          { status: 401 }
        );
      }

      // Return user without password
      const safeUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        assigned_number: user.assigned_number,
        created_at: user.created_at,
      };

      return NextResponse.json({ user: safeUser, error: null });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("Login API Error:", err);
    return NextResponse.json(
      { error: "An error occurred during login. Please try again." },
      { status: 500 }
    );
  }
}
