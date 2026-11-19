export interface DbResponse<T = any> {
  data: T | null;
  error: { message: string } | null;
  count?: number | null;
}

export class QueryBuilder<T = any> implements PromiseLike<DbResponse<T>> {
  private table: string;
  private action: "select" | "insert" | "update" | "delete" = "select";
  private selectCols: string = "*";
  private countOption?: "exact";
  private head: boolean = false;
  private singleOption: boolean = false;
  private filters: Array<{ type: "eq" | "in"; column: string; value: any }> = [];
  private orConditions: string[] = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private limitCount?: number;
  private offsetCount?: number;
  private valuesPayload?: any;

  constructor(table: string) {
    this.table = table;
  }

  select(
    cols: string = "*",
    options?: { count?: "exact" | string; head?: boolean }
  ): this {
    this.action = "select";
    this.selectCols = cols;
    if (options?.count === "exact") {
      this.countOption = "exact";
    }
    if (options?.head) {
      this.head = true;
    }
    return this;
  }

  insert(values: any): this {
    this.action = "insert";
    this.valuesPayload = values;
    return this;
  }

  update(values: any): this {
    this.action = "update";
    this.valuesPayload = values;
    return this;
  }

  delete(): this {
    this.action = "delete";
    return this;
  }

  eq(column: string, value: any): this {
    this.filters.push({ type: "eq", column, value });
    return this;
  }

  in(column: string, values: any[]): this {
    this.filters.push({ type: "in", column, value: values });
    return this;
  }

  or(conditionString: string): this {
    if (conditionString) {
      this.orConditions.push(conditionString);
    }
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orders.push({
      column,
      ascending: options?.ascending !== false,
    });
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number): this {
    this.offsetCount = from;
    this.limitCount = Math.max(0, to - from + 1);
    return this;
  }

  single(): this {
    this.singleOption = true;
    this.limitCount = 1;
    return this;
  }

  async execute(): Promise<DbResponse<T>> {
    try {
      const payload: any = {
        table: this.table,
        action: this.action,
        filters: this.filters,
        orConditions: this.orConditions,
      };

      if (this.action === "select") {
        payload.select = this.selectCols;
        payload.orders = this.orders;
        payload.single = this.singleOption;
        payload.head = this.head;
        if (this.countOption) payload.count = this.countOption;
        if (typeof this.limitCount === "number") payload.limit = this.limitCount;
        if (typeof this.offsetCount === "number") payload.offset = this.offsetCount;
      } else if (this.action === "insert" || this.action === "update") {
        payload.values = this.valuesPayload;
      }

      const res = await fetch("/api/db", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        return {
          data: null,
          error: json.error || { message: "Database request failed" },
          count: json.count ?? null,
        };
      }

      return json;
    } catch (err: any) {
      return {
        data: null,
        error: { message: err?.message || "Network error" },
        count: null,
      };
    }
  }

  then<TResult1 = DbResponse<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: DbResponse<T>) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | undefined
      | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export class NeonClient {
  from<T = any>(table: string): QueryBuilder<T> {
    return new QueryBuilder<T>(table);
  }
}

const clientInstance = new NeonClient();

export const createClient = () => {
  return clientInstance;
};

export const db = clientInstance;
