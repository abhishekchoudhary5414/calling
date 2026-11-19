import { NextResponse } from "next/server";
import { pool } from "@/lib/db-server";
import bcrypt from "bcryptjs";

const ALLOWED_TABLES = new Set([
  "users",
  "schools",
  "tasks",
  "notes",
  "user_school_assignments",
]);

function isValidIdentifier(name: string): boolean {
  return /^[a-zA-Z0-9_]+$/.test(name);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      table,
      action,
      select = "*",
      filters = [],
      orConditions = [],
      orders = [],
      limit,
      offset,
      count: countOption,
      head = false,
      single = false,
      values,
    } = body;

    if (!table || !ALLOWED_TABLES.has(table)) {
      return NextResponse.json(
        { data: null, error: { message: `Invalid table name: ${table}` } },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      if (action === "select") {
        const params: any[] = [];
        const whereClauses: string[] = [];

        // Parse regular filters (eq, in)
        for (const f of filters) {
          if (!isValidIdentifier(f.column)) continue;
          if (f.type === "eq") {
            params.push(f.value);
            whereClauses.push(`"${f.column}" = $${params.length}`);
          } else if (f.type === "in" && Array.isArray(f.value)) {
            if (f.value.length === 0) {
              whereClauses.push("1=0");
            } else {
              params.push(f.value);
              whereClauses.push(`"${f.column}" = ANY($${params.length})`);
            }
          }
        }

        // Parse OR conditions, e.g. "entity_type.eq.school,entity_type.is.null"
        // or "id.in.(uuid1,uuid2),phone.eq.123456"
        for (const orCond of orConditions) {
          if (typeof orCond !== "string") continue;
          const parts = orCond.split(",");
          const orSubClauses: string[] = [];

          for (const rawPart of parts) {
            const part = rawPart.trim();
            // Match col.is.null
            const isMatch = part.match(/^([a-zA-Z0-9_]+)\.is\.(null|notnull)$/i);
            if (isMatch) {
              const [, col, val] = isMatch;
              if (isValidIdentifier(col)) {
                orSubClauses.push(
                  val.toLowerCase() === "null" ? `"${col}" IS NULL` : `"${col}" IS NOT NULL`
                );
              }
              continue;
            }

            // Match col.eq.value
            const eqMatch = part.match(/^([a-zA-Z0-9_]+)\.eq\.(.*)$/);
            if (eqMatch) {
              const [, col, val] = eqMatch;
              if (isValidIdentifier(col)) {
                params.push(val);
                orSubClauses.push(`"${col}" = $${params.length}`);
              }
              continue;
            }

            // Match col.in.(val1,val2,...)
            const inMatch = part.match(/^([a-zA-Z0-9_]+)\.in\.\((.*)\)$/);
            if (inMatch) {
              const [, col, valList] = inMatch;
              if (isValidIdentifier(col)) {
                const inValues = valList
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean);
                if (inValues.length > 0) {
                  params.push(inValues);
                  orSubClauses.push(`"${col}" = ANY($${params.length})`);
                }
              }
              continue;
            }
          }

          if (orSubClauses.length > 0) {
            whereClauses.push(`(${orSubClauses.join(" OR ")})`);
          }
        }

        const whereSql =
          whereClauses.length > 0 ? ` WHERE ${whereClauses.join(" AND ")}` : "";

        // If count is requested
        let totalCount: number | null = null;
        if (countOption === "exact") {
          const countSql = `SELECT COUNT(*) AS total FROM "${table}"${whereSql}`;
          const countRes = await client.query(countSql, params);
          totalCount = parseInt(countRes.rows[0]?.total || "0", 10);
        }

        // If head=true, only return count without data rows
        if (head) {
          return NextResponse.json({
            data: [],
            error: null,
            count: totalCount,
          });
        }

        // Order clauses
        const orderClauses: string[] = [];
        for (const ord of orders) {
          if (isValidIdentifier(ord.column)) {
            const dir = ord.ascending ? "ASC" : "DESC";
            orderClauses.push(`"${ord.column}" ${dir}`);
          }
        }
        const orderSql =
          orderClauses.length > 0 ? ` ORDER BY ${orderClauses.join(", ")}` : "";

        // Pagination
        let paginationSql = "";
        if (typeof limit === "number" && limit >= 0) {
          paginationSql += ` LIMIT ${limit}`;
        }
        if (typeof offset === "number" && offset >= 0) {
          paginationSql += ` OFFSET ${offset}`;
        }

        // Select columns
        let selectSql = "*";
        if (typeof select === "string" && select !== "*") {
          const cols = select
            .split(",")
            .map((c) => c.trim())
            .filter(isValidIdentifier)
            .map((c) => `"${c}"`);
          if (cols.length > 0) {
            selectSql = cols.join(", ");
          }
        }

        const dataSql = `SELECT ${selectSql} FROM "${table}"${whereSql}${orderSql}${paginationSql}`;
        const dataRes = await client.query(dataSql, params);

        // Sanitize password from users table responses
        if (table === "users") {
          dataRes.rows.forEach((r) => {
            delete r.password;
          });
        }

        if (single) {
          if (dataRes.rows.length === 0) {
            return NextResponse.json({
              data: null,
              error: { message: "Row not found" },
              count: totalCount,
            });
          }
          return NextResponse.json({
            data: dataRes.rows[0],
            error: null,
            count: totalCount,
          });
        }

        return NextResponse.json({
          data: dataRes.rows,
          error: null,
          count: totalCount,
        });
      }

      if (action === "insert") {
        if (!values) {
          return NextResponse.json(
            { data: null, error: { message: "No values provided for insert" } },
            { status: 400 }
          );
        }

        const rowsToInsert = Array.isArray(values) ? values : [values];
        if (rowsToInsert.length === 0) {
          return NextResponse.json({ data: [], error: null });
        }

        // Hash passwords if inserting into users table
        if (table === "users") {
          for (const row of rowsToInsert) {
            if (row.password && typeof row.password === "string") {
              if (!row.password.startsWith("$2a$") && !row.password.startsWith("$2b$")) {
                row.password = bcrypt.hashSync(row.password, 10);
              }
            }
          }
        }

        // Extract columns from first object
        const columns = Object.keys(rowsToInsert[0]).filter(isValidIdentifier);
        if (columns.length === 0) {
          return NextResponse.json(
            { data: null, error: { message: "No valid columns provided" } },
            { status: 400 }
          );
        }

        const colNamesSql = columns.map((c) => `"${c}"`).join(", ");
        const params: any[] = [];
        const valuePlaceholders: string[] = [];

        for (const row of rowsToInsert) {
          const rowPlaceholders: string[] = [];
          for (const col of columns) {
            params.push(row[col] !== undefined ? row[col] : null);
            rowPlaceholders.push(`$${params.length}`);
          }
          valuePlaceholders.push(`(${rowPlaceholders.join(", ")})`);
        }

        const insertSql = `INSERT INTO "${table}" (${colNamesSql}) VALUES ${valuePlaceholders.join(
          ", "
        )} RETURNING *`;
        const insertRes = await client.query(insertSql, params);

        if (table === "users") {
          insertRes.rows.forEach((r) => {
            delete r.password;
          });
        }

        return NextResponse.json({
          data: Array.isArray(values) ? insertRes.rows : insertRes.rows[0],
          error: null,
        });
      }

      if (action === "update") {
        if (!values || typeof values !== "object") {
          return NextResponse.json(
            { data: null, error: { message: "No values provided for update" } },
            { status: 400 }
          );
        }

        // Hash password if updating users table
        if (table === "users" && values.password && typeof values.password === "string") {
          if (!values.password.startsWith("$2a$") && !values.password.startsWith("$2b$")) {
            values.password = bcrypt.hashSync(values.password, 10);
          }
        }

        const updateCols = Object.keys(values).filter(isValidIdentifier);
        if (updateCols.length === 0) {
          return NextResponse.json(
            { data: null, error: { message: "No valid columns provided for update" } },
            { status: 400 }
          );
        }

        const params: any[] = [];
        const setClauses: string[] = [];

        for (const col of updateCols) {
          params.push(values[col]);
          setClauses.push(`"${col}" = $${params.length}`);
        }

        const whereClauses: string[] = [];
        for (const f of filters) {
          if (!isValidIdentifier(f.column)) continue;
          if (f.type === "eq") {
            params.push(f.value);
            whereClauses.push(`"${f.column}" = $${params.length}`);
          } else if (f.type === "in" && Array.isArray(f.value)) {
            if (f.value.length === 0) {
              whereClauses.push("1=0");
            } else {
              params.push(f.value);
              whereClauses.push(`"${f.column}" = ANY($${params.length})`);
            }
          }
        }

        const whereSql =
          whereClauses.length > 0 ? ` WHERE ${whereClauses.join(" AND ")}` : "";
        const updateSql = `UPDATE "${table}" SET ${setClauses.join(
          ", "
        )}${whereSql} RETURNING *`;

        const updateRes = await client.query(updateSql, params);

        if (table === "users") {
          updateRes.rows.forEach((r) => {
            delete r.password;
          });
        }

        return NextResponse.json({
          data: updateRes.rows,
          error: null,
        });
      }

      if (action === "delete") {
        const params: any[] = [];
        const whereClauses: string[] = [];

        for (const f of filters) {
          if (!isValidIdentifier(f.column)) continue;
          if (f.type === "eq") {
            params.push(f.value);
            whereClauses.push(`"${f.column}" = $${params.length}`);
          } else if (f.type === "in" && Array.isArray(f.value)) {
            if (f.value.length === 0) {
              whereClauses.push("1=0");
            } else {
              params.push(f.value);
              whereClauses.push(`"${f.column}" = ANY($${params.length})`);
            }
          }
        }

        const whereSql =
          whereClauses.length > 0 ? ` WHERE ${whereClauses.join(" AND ")}` : "";
        const deleteSql = `DELETE FROM "${table}"${whereSql} RETURNING *`;
        const deleteRes = await client.query(deleteSql, params);

        return NextResponse.json({
          data: deleteRes.rows,
          error: null,
        });
      }

      return NextResponse.json(
        { data: null, error: { message: `Unknown action: ${action}` } },
        { status: 400 }
      );
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("API DB Error:", err);
    return NextResponse.json(
      { data: null, error: { message: err?.message || "Internal server error" } },
      { status: 500 }
    );
  }
}
