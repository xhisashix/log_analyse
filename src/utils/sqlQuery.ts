import type { LogEntry } from '@/types/log'

// ============================================================
// 1. Token 定義
// ============================================================

type TokenType =
  | 'SELECT' | 'FROM' | 'WHERE' | 'AND' | 'OR' | 'NOT'
  | 'ORDER' | 'BY' | 'ASC' | 'DESC' | 'LIMIT' | 'OFFSET'
  | 'LIKE' | 'IN' | 'BETWEEN' | 'IS' | 'NULL'
  | 'STAR'
  | 'IDENT' | 'STRING' | 'NUMBER'
  | 'EQ' | 'NEQ' | 'LT' | 'GT' | 'LTE' | 'GTE'
  | 'LPAREN' | 'RPAREN' | 'COMMA' | 'DOT'
  | 'EOF'

interface Token {
  type: TokenType
  value: string
  pos: number
}

const KEYWORDS: Record<string, TokenType> = {
  SELECT: 'SELECT', FROM: 'FROM', WHERE: 'WHERE',
  AND: 'AND', OR: 'OR', NOT: 'NOT',
  ORDER: 'ORDER', BY: 'BY', ASC: 'ASC', DESC: 'DESC',
  LIMIT: 'LIMIT', OFFSET: 'OFFSET',
  LIKE: 'LIKE', IN: 'IN', BETWEEN: 'BETWEEN',
  IS: 'IS', NULL: 'NULL',
}

// ============================================================
// 2. Tokenizer
// ============================================================

function tokenize(sql: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < sql.length) {
    // skip whitespace
    if (/\s/.test(sql[i])) { i++; continue }

    const pos = i

    // single-quoted string
    if (sql[i] === "'") {
      i++
      let value = ''
      while (i < sql.length && sql[i] !== "'") {
        if (sql[i] === '\\' && i + 1 < sql.length) { value += sql[++i]; i++; continue }
        value += sql[i]; i++
      }
      if (i >= sql.length) throw new SqlParseError("文字列リテラルが閉じられていません", pos)
      i++ // closing '
      tokens.push({ type: 'STRING', value, pos })
      continue
    }

    // number (including negative via unary minus handled in parser)
    if (/\d/.test(sql[i]) || (sql[i] === '.' && i + 1 < sql.length && /\d/.test(sql[i + 1]))) {
      let num = ''
      while (i < sql.length && /[\d.]/.test(sql[i])) { num += sql[i]; i++ }
      tokens.push({ type: 'NUMBER', value: num, pos })
      continue
    }

    // operators
    if (sql[i] === '!' && sql[i + 1] === '=') { tokens.push({ type: 'NEQ', value: '!=', pos }); i += 2; continue }
    if (sql[i] === '<' && sql[i + 1] === '>') { tokens.push({ type: 'NEQ', value: '<>', pos }); i += 2; continue }
    if (sql[i] === '<' && sql[i + 1] === '=') { tokens.push({ type: 'LTE', value: '<=', pos }); i += 2; continue }
    if (sql[i] === '>' && sql[i + 1] === '=') { tokens.push({ type: 'GTE', value: '>=', pos }); i += 2; continue }
    if (sql[i] === '<') { tokens.push({ type: 'LT', value: '<', pos }); i++; continue }
    if (sql[i] === '>') { tokens.push({ type: 'GT', value: '>', pos }); i++; continue }
    if (sql[i] === '=') { tokens.push({ type: 'EQ', value: '=', pos }); i++; continue }

    // symbols
    if (sql[i] === '*') { tokens.push({ type: 'STAR', value: '*', pos }); i++; continue }
    if (sql[i] === '(') { tokens.push({ type: 'LPAREN', value: '(', pos }); i++; continue }
    if (sql[i] === ')') { tokens.push({ type: 'RPAREN', value: ')', pos }); i++; continue }
    if (sql[i] === ',') { tokens.push({ type: 'COMMA', value: ',', pos }); i++; continue }
    if (sql[i] === '.') { tokens.push({ type: 'DOT', value: '.', pos }); i++; continue }

    // identifier / keyword
    if (/[a-zA-Z_]/.test(sql[i])) {
      let ident = ''
      while (i < sql.length && /[a-zA-Z0-9_\-]/.test(sql[i])) { ident += sql[i]; i++ }
      const upper = ident.toUpperCase()
      const kwType = KEYWORDS[upper]
      tokens.push({ type: kwType ?? 'IDENT', value: kwType ? upper : ident, pos })
      continue
    }

    throw new SqlParseError(`不正な文字: '${sql[i]}'`, pos)
  }

  tokens.push({ type: 'EOF', value: '', pos: i })
  return tokens
}

// ============================================================
// 3. AST 型
// ============================================================

interface SelectStatement {
  table: string
  where: Expr | null
  orderBy: OrderByClause[]
  limit: number | null
  offset: number | null
}

type Expr =
  | { kind: 'comparison'; field: string; op: string; value: SqlValue }
  | { kind: 'like'; field: string; pattern: string; negated: boolean }
  | { kind: 'in'; field: string; values: SqlValue[]; negated: boolean }
  | { kind: 'between'; field: string; low: SqlValue; high: SqlValue; negated: boolean }
  | { kind: 'is_null'; field: string; negated: boolean }
  | { kind: 'and'; left: Expr; right: Expr }
  | { kind: 'or'; left: Expr; right: Expr }
  | { kind: 'not'; expr: Expr }

type SqlValue = string | number | null

interface OrderByClause {
  field: string
  direction: 'ASC' | 'DESC'
}

// ============================================================
// 4. Parser (recursive descent)
// ============================================================

export class SqlParseError extends Error {
  constructor(msg: string, public pos?: number) {
    super(msg)
    this.name = 'SqlParseError'
  }
}

class Parser {
  private pos = 0
  constructor(private tokens: Token[]) {}

  private peek(): Token { return this.tokens[this.pos] }
  private advance(): Token { return this.tokens[this.pos++] }

  private expect(type: TokenType): Token {
    const t = this.peek()
    if (t.type !== type) throw new SqlParseError(`'${type}' が必要ですが '${t.value || t.type}' がありました`, t.pos)
    return this.advance()
  }

  private match(...types: TokenType[]): Token | null {
    if (types.includes(this.peek().type)) return this.advance()
    return null
  }

  parse(): SelectStatement {
    this.expect('SELECT')
    this.expect('STAR')
    this.expect('FROM')
    const tableToken = this.expect('IDENT')
    const table = tableToken.value.toLowerCase()

    const validTables = ['logs', 'apache', 'php', 'drupal']
    if (!validTables.includes(table)) {
      throw new SqlParseError(`不正なテーブル名: '${tableToken.value}'。使用可能: ${validTables.join(', ')}`, tableToken.pos)
    }

    let where: Expr | null = null
    if (this.match('WHERE')) {
      where = this.parseOr()
    }

    const orderBy: OrderByClause[] = []
    if (this.match('ORDER')) {
      this.expect('BY')
      do {
        const field = this.expect('IDENT').value
        let direction: 'ASC' | 'DESC' = 'ASC'
        if (this.match('ASC')) direction = 'ASC'
        else if (this.match('DESC')) direction = 'DESC'
        orderBy.push({ field, direction })
      } while (this.match('COMMA'))
    }

    let limit: number | null = null
    if (this.match('LIMIT')) {
      limit = Number(this.expect('NUMBER').value)
    }

    let offset: number | null = null
    if (this.match('OFFSET')) {
      offset = Number(this.expect('NUMBER').value)
    }

    this.expect('EOF')
    return { table, where, orderBy, limit, offset }
  }

  // ---- WHERE expression parsing ----

  private parseOr(): Expr {
    let left = this.parseAnd()
    while (this.match('OR')) {
      left = { kind: 'or', left, right: this.parseAnd() }
    }
    return left
  }

  private parseAnd(): Expr {
    let left = this.parseUnary()
    while (this.match('AND')) {
      left = { kind: 'and', left, right: this.parseUnary() }
    }
    return left
  }

  private parseUnary(): Expr {
    if (this.match('NOT')) {
      return { kind: 'not', expr: this.parseUnary() }
    }
    if (this.match('LPAREN')) {
      const expr = this.parseOr()
      this.expect('RPAREN')
      return expr
    }
    return this.parsePredicate()
  }

  private parsePredicate(): Expr {
    const fieldToken = this.expect('IDENT')
    const field = fieldToken.value

    // IS [NOT] NULL
    if (this.match('IS')) {
      const negated = !!this.match('NOT')
      this.expect('NULL')
      return { kind: 'is_null', field, negated }
    }

    // [NOT] BETWEEN ... AND ...
    const notBefore = this.match('NOT')
    if (this.match('BETWEEN')) {
      const low = this.parseLiteral()
      this.expect('AND')
      const high = this.parseLiteral()
      return { kind: 'between', field, low, high, negated: !!notBefore }
    }

    // [NOT] IN (...)
    if (this.match('IN')) {
      this.expect('LPAREN')
      const values: SqlValue[] = [this.parseLiteral()]
      while (this.match('COMMA')) {
        values.push(this.parseLiteral())
      }
      this.expect('RPAREN')
      return { kind: 'in', field, values, negated: !!notBefore }
    }

    // [NOT] LIKE '...'
    if (this.match('LIKE')) {
      const pat = this.expect('STRING').value
      return { kind: 'like', field, pattern: pat, negated: !!notBefore }
    }

    if (notBefore) {
      throw new SqlParseError("NOT の後に BETWEEN, IN, LIKE が必要です", fieldToken.pos)
    }

    // comparison: =, !=, <>, <, >, <=, >=
    const opToken = this.peek()
    const op = this.matchCompOp()
    if (!op) throw new SqlParseError(`演算子が必要ですが '${opToken.value || opToken.type}' がありました`, opToken.pos)
    const value = this.parseLiteral()
    return { kind: 'comparison', field, op, value }
  }

  private matchCompOp(): string | null {
    const t = this.peek()
    if (['EQ', 'NEQ', 'LT', 'GT', 'LTE', 'GTE'].includes(t.type)) {
      this.advance()
      return t.value
    }
    return null
  }

  private parseLiteral(): SqlValue {
    if (this.match('NULL')) return null
    const strTok = this.match('STRING')
    if (strTok) return strTok.value
    const numTok = this.match('NUMBER')
    if (numTok) return Number(numTok.value)
    const t = this.peek()
    throw new SqlParseError(`値が必要ですが '${t.value || t.type}' がありました`, t.pos)
  }
}

// ============================================================
// 5. Field resolver
// ============================================================

// SQL field → TypeScript entry property
const FIELD_MAP: Record<string, string> = {
  // common
  timestamp: 'timestamp',
  log_type: 'type',
  raw: 'raw',
  // apache
  ip: 'ip',
  method: 'method',
  path: 'path',
  status: 'status',
  bytes: 'bytes',
  referer: 'referer',
  user_agent: 'userAgent',
  protocol: 'protocol',
  // php
  level: 'level',
  message: 'message',
  file: 'file',
  line: 'line',
  // drupal
  severity: 'severity',
  watchdog_type: 'watchdogType',
  request_uri: 'requestUri',
  site_name: 'siteName',
  domain: 'domain',
  uid: 'uid',
  request_id: 'requestId',
}

function resolveField(entry: LogEntry, sqlField: string): SqlValue {
  const tsField = FIELD_MAP[sqlField.toLowerCase()] ?? sqlField
  const val = (entry as unknown as Record<string, unknown>)[tsField]
  if (val === undefined) return null
  if (val instanceof Date) return val.toISOString()
  if (typeof val === 'number') return val
  if (typeof val === 'string') return val
  return String(val)
}

// ============================================================
// 6. Evaluator
// ============================================================

function likeToRegex(pattern: string): RegExp {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '%') { re += '.*'; continue }
    if (c === '_') { re += '.'; continue }
    // escape regex metacharacters
    if (/[\\^$.|?*+()[\]{}]/.test(c)) { re += '\\' + c; continue }
    re += c
  }
  return new RegExp(`^${re}$`, 'i')
}

function compareValues(a: SqlValue, b: SqlValue): number {
  if (a === null && b === null) return 0
  if (a === null) return -1
  if (b === null) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

function evalExpr(entry: LogEntry, expr: Expr): boolean {
  switch (expr.kind) {
    case 'and': return evalExpr(entry, expr.left) && evalExpr(entry, expr.right)
    case 'or': return evalExpr(entry, expr.left) || evalExpr(entry, expr.right)
    case 'not': return !evalExpr(entry, expr.expr)

    case 'comparison': {
      const fieldVal = resolveField(entry, expr.field)
      const rhs = expr.value
      // coerce: if field is number and rhs is string-number, compare numerically
      const cmp = compareValues(
        typeof fieldVal === 'number' ? fieldVal : fieldVal,
        typeof fieldVal === 'number' && typeof rhs === 'string' ? Number(rhs) : rhs
      )
      switch (expr.op) {
        case '=': return cmp === 0
        case '!=': case '<>': return cmp !== 0
        case '<': return cmp < 0
        case '>': return cmp > 0
        case '<=': return cmp <= 0
        case '>=': return cmp >= 0
        default: return false
      }
    }

    case 'like': {
      const val = resolveField(entry, expr.field)
      if (val === null) return expr.negated
      const match = likeToRegex(expr.pattern).test(String(val))
      return expr.negated ? !match : match
    }

    case 'in': {
      const val = resolveField(entry, expr.field)
      const found = expr.values.some((v) => compareValues(val, v) === 0)
      return expr.negated ? !found : found
    }

    case 'between': {
      const val = resolveField(entry, expr.field)
      const inRange = compareValues(val, expr.low) >= 0 && compareValues(val, expr.high) <= 0
      return expr.negated ? !inRange : inRange
    }

    case 'is_null': {
      const val = resolveField(entry, expr.field)
      const isNull = val === null || val === undefined
      return expr.negated ? !isNull : isNull
    }
  }
}

function filterByTable(entries: LogEntry[], table: string): LogEntry[] {
  switch (table) {
    case 'apache': return entries.filter((e) => e.type === 'apache')
    case 'php': return entries.filter((e) => e.type === 'php')
    case 'drupal': return entries.filter((e) => e.type === 'drupal-watchdog')
    default: return entries // 'logs' = all
  }
}

// ============================================================
// 7. Public API
// ============================================================

export interface SqlQueryResult {
  entries: LogEntry[]
  error: string | null
}

/**
 * SQLクエリーを解析してログエントリの配列に適用し、
 * フィルタ・ソート・件数制限済みの結果を返す。
 */
export function executeSql(sql: string, allEntries: LogEntry[]): SqlQueryResult {
  const trimmed = sql.trim()
  if (!trimmed) return { entries: allEntries, error: null }

  try {
    const tokens = tokenize(trimmed)
    const ast = new Parser(tokens).parse()

    // 1. table filter
    let results = filterByTable(allEntries, ast.table)

    // 2. WHERE
    if (ast.where) {
      const whereExpr = ast.where
      results = results.filter((e) => evalExpr(e, whereExpr))
    }

    // 3. ORDER BY
    if (ast.orderBy.length > 0) {
      results = [...results].sort((a, b) => {
        for (const ob of ast.orderBy) {
          const va = resolveField(a, ob.field)
          const vb = resolveField(b, ob.field)
          const cmp = compareValues(va, vb)
          if (cmp !== 0) return ob.direction === 'DESC' ? -cmp : cmp
        }
        return 0
      })
    }

    // 4. OFFSET
    if (ast.offset !== null && ast.offset > 0) {
      results = results.slice(ast.offset)
    }

    // 5. LIMIT
    if (ast.limit !== null && ast.limit >= 0) {
      results = results.slice(0, ast.limit)
    }

    return { entries: results, error: null }
  } catch (e) {
    if (e instanceof SqlParseError) {
      return { entries: [], error: e.message }
    }
    return { entries: [], error: e instanceof Error ? e.message : String(e) }
  }
}

// ============================================================
// 8. Autocomplete helpers
// ============================================================

const COMMON_FIELDS = ['timestamp', 'log_type', 'raw']
const APACHE_FIELDS = ['ip', 'method', 'path', 'status', 'bytes', 'referer', 'user_agent', 'protocol']
const PHP_FIELDS = ['level', 'message', 'file', 'line']
const DRUPAL_FIELDS = ['severity', 'watchdog_type', 'message', 'ip', 'request_uri', 'site_name', 'domain', 'uid', 'request_id']

/** テーブル名に応じて使用可能なフィールド名を返す */
export function getFieldsForTable(table: string): string[] {
  switch (table) {
    case 'apache': return [...COMMON_FIELDS, ...APACHE_FIELDS]
    case 'php': return [...COMMON_FIELDS, ...PHP_FIELDS]
    case 'drupal': return [...COMMON_FIELDS, ...DRUPAL_FIELDS]
    default: return [...COMMON_FIELDS, ...APACHE_FIELDS, ...PHP_FIELDS, ...DRUPAL_FIELDS]
  }
}

/** フィールド名に対応する値のヒント（列挙型値）を返す */
export function getValueHints(field: string): string[] {
  switch (field.toLowerCase()) {
    case 'method': return ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'PATCH']
    case 'level': return ['Fatal error', 'Parse error', 'Warning', 'Notice', 'Deprecated', 'Strict Standards']
    case 'severity': return ['emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug']
    case 'log_type': return ['apache', 'php', 'drupal-watchdog']
    default: return []
  }
}

export const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT',
  'ORDER BY', 'ASC', 'DESC', 'LIMIT', 'OFFSET',
  'LIKE', 'NOT LIKE', 'IN', 'NOT IN', 'BETWEEN',
  'IS NULL', 'IS NOT NULL',
]

export const TABLE_NAMES = ['logs', 'apache', 'php', 'drupal']

export interface Suggestion {
  label: string
  type: 'keyword' | 'table' | 'field' | 'value' | 'operator'
  insertText: string
}

/**
 * カーソル位置までのSQL文を解析し、オートコンプリート候補を返す。
 * 簡易的なコンテキスト判定で候補を生成する。
 */
export function getSuggestions(sql: string, cursorPos: number): Suggestion[] {
  const before = sql.slice(0, cursorPos)
  const tokens = before.trim().split(/\s+/).filter(Boolean)
  const lastToken = (tokens[tokens.length - 1] ?? '').toLowerCase()
  const prevToken = (tokens[tokens.length - 2] ?? '').toLowerCase()

  // empty → SELECT
  if (tokens.length === 0) {
    return [{ label: 'SELECT * FROM', type: 'keyword', insertText: 'SELECT * FROM ' }]
  }

  // after FROM → table names
  if (lastToken === 'from' || (prevToken === 'from' && tokens.length >= 2)) {
    if (lastToken === 'from') {
      return TABLE_NAMES.map((t) => ({ label: t, type: 'table' as const, insertText: t + ' ' }))
    }
    // partial match
    return TABLE_NAMES
      .filter((t) => t.startsWith(lastToken))
      .map((t) => ({ label: t, type: 'table' as const, insertText: t + ' ' }))
  }

  // detect table from FROM clause
  const fromMatch = before.match(/FROM\s+(\w+)/i)
  const table = fromMatch?.[1]?.toLowerCase() ?? 'logs'

  // after WHERE, AND, OR → field names
  if (['where', 'and', 'or', 'not', '('].includes(lastToken)) {
    return getFieldsForTable(table).map((f) => ({ label: f, type: 'field' as const, insertText: f + ' ' }))
  }

  // after field name → operators
  const fields = getFieldsForTable(table)
  if (fields.some((f) => f === lastToken)) {
    return [
      { label: '=', type: 'operator', insertText: '= ' },
      { label: '!=', type: 'operator', insertText: '!= ' },
      { label: '<', type: 'operator', insertText: '< ' },
      { label: '>', type: 'operator', insertText: '> ' },
      { label: '<=', type: 'operator', insertText: '<= ' },
      { label: '>=', type: 'operator', insertText: '>= ' },
      { label: 'LIKE', type: 'operator', insertText: 'LIKE ' },
      { label: 'NOT LIKE', type: 'operator', insertText: 'NOT LIKE ' },
      { label: 'IN', type: 'operator', insertText: 'IN (' },
      { label: 'NOT IN', type: 'operator', insertText: 'NOT IN (' },
      { label: 'BETWEEN', type: 'operator', insertText: 'BETWEEN ' },
      { label: 'IS NULL', type: 'operator', insertText: 'IS NULL ' },
      { label: 'IS NOT NULL', type: 'operator', insertText: 'IS NOT NULL ' },
    ]
  }

  // after operator → value hints for specific fields
  if (['=', '!=', '<>', 'like'].includes(lastToken)) {
    // find the field name before operator
    const fieldName = prevToken
    const hints = getValueHints(fieldName)
    if (hints.length > 0) {
      return hints.map((v) => ({ label: v, type: 'value' as const, insertText: `'${v}' ` }))
    }
  }

  // after ORDER → BY
  if (lastToken === 'order') {
    return [{ label: 'BY', type: 'keyword', insertText: 'BY ' }]
  }

  // after ORDER BY → fields
  if (lastToken === 'by' && prevToken === 'order') {
    return getFieldsForTable(table).map((f) => ({ label: f, type: 'field' as const, insertText: f + ' ' }))
  }

  // partial matches for keywords, fields
  const suggestions: Suggestion[] = []
  if (lastToken.length >= 1) {
    const kws = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'ORDER BY', 'ASC', 'DESC', 'LIMIT', 'OFFSET', 'LIKE', 'IN', 'BETWEEN', 'IS NULL', 'IS NOT NULL']
    for (const kw of kws) {
      if (kw.toLowerCase().startsWith(lastToken)) {
        suggestions.push({ label: kw, type: 'keyword', insertText: kw + ' ' })
      }
    }
    for (const f of getFieldsForTable(table)) {
      if (f.startsWith(lastToken)) {
        suggestions.push({ label: f, type: 'field', insertText: f + ' ' })
      }
    }
  }

  return suggestions
}

/** サンプルクエリー一覧 */
export const SAMPLE_QUERIES: { label: string; sql: string }[] = [
  { label: 'Apache 404エラー', sql: "SELECT * FROM apache WHERE status = 404" },
  { label: 'Apache GETリクエスト(管理画面)', sql: "SELECT * FROM apache WHERE method = 'GET' AND path LIKE '/admin%'" },
  { label: 'Apache 5xxエラー(最新100件)', sql: "SELECT * FROM apache WHERE status >= 500 ORDER BY timestamp DESC LIMIT 100" },
  { label: 'PHPエラー(Fatalのみ)', sql: "SELECT * FROM php WHERE level = 'Fatal error'" },
  { label: 'PHPエラー(日付範囲)', sql: "SELECT * FROM php WHERE timestamp >= '2024-01-01' AND timestamp < '2024-02-01'" },
  { label: 'Drupal critical以上', sql: "SELECT * FROM drupal WHERE severity IN ('emergency', 'alert', 'critical')" },
  { label: '全ログ(最新50件)', sql: "SELECT * FROM logs ORDER BY timestamp DESC LIMIT 50" },
]
