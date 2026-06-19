/**
 * Shared message catalog for the report — UI chrome, condition names and
 * reasons. Keys are a union, so every locale must define every key (a missing
 * key is a compile error). Templates use `{placeholder}` substitution; the
 * dynamic parts (status codes, param names, value lists) are passed as params
 * and are not themselves translated.
 */

export type Locale = "en" | "ru";

export type MessageKey =
  // UI chrome
  | "title"
  | "navSummary"
  | "navOperations"
  | "coverage"
  | "full"
  | "partial"
  | "empty"
  | "deprecated"
  | "operations"
  | "conditions"
  | "conditionTypes"
  | "covered"
  | "total"
  | "zeroCall"
  | "tags"
  | "missed"
  | "calls"
  | "generated"
  | "generation"
  | "specSource"
  | "filesRead"
  | "callsRecorded"
  // condition names
  | "cond.status"
  | "cond.onlyDeclaredStatus"
  | "cond.onlyDeclaredResponseFields"
  | "cond.paramNotEmpty"
  | "cond.headerEmpty"
  | "cond.paramEnumAll"
  | "cond.paramEnumAnother"
  | "cond.notEmptyBody"
  | "cond.propNotEmpty"
  | "cond.propEnumAll"
  | "cond.propEnumAnother"
  // reasons
  | "reason.noCalls"
  | "reason.undeclaredStatus"
  | "reason.noResponseFields"
  | "reason.undeclaredFields"
  | "reason.missedValues"
  | "reason.checkedValues";

/** A translatable message: a catalog key plus optional substitution params. */
export interface Message {
  key: MessageKey;
  params?: Record<string, string>;
}

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = {
  en: {
    title: "radar",
    navSummary: "Summary",
    navOperations: "Operations",
    coverage: "coverage",
    full: "Full",
    partial: "Partial",
    empty: "Empty",
    deprecated: "Deprecated",
    operations: "operations",
    conditions: "Conditions",
    conditionTypes: "Conditions by type",
    covered: "Covered",
    total: "Total",
    zeroCall: "Never called",
    tags: "Tags",
    missed: "Missed calls",
    calls: "calls",
    generated: "Generated",
    generation: "Generation",
    specSource: "Spec source",
    filesRead: "Coverage files",
    callsRecorded: "Recorded calls",
    "cond.status": "HTTP status {status}",
    "cond.onlyDeclaredStatus": "only declared status",
    "cond.onlyDeclaredResponseFields": "only declared response fields",
    "cond.paramNotEmpty": "{in} «{name}» is not empty",
    "cond.headerEmpty": "header «{name}» is empty",
    "cond.paramEnumAll": "{in} «{name}» contains all values from enum [{values}]",
    "cond.paramEnumAnother": "{in} «{name}» contains values not only from enum",
    "cond.notEmptyBody": "not empty body request",
    "cond.propNotEmpty": "«{name}» is not empty",
    "cond.propEnumAll": "«{name}» contains all values from enum [{values}]",
    "cond.propEnumAnother": "«{name}» contains values not only from enum",
    "reason.noCalls": "No calls — no statuses",
    "reason.undeclaredStatus": "Undeclared status: {values}",
    "reason.noResponseFields": "No response fields observed",
    "reason.undeclaredFields": "Undeclared fields: {values}",
    "reason.missedValues": "Missed values [{values}]",
    "reason.checkedValues": "Checked values: [{values}]",
  },
  ru: {
    title: "radar",
    navSummary: "Сводка",
    navOperations: "Операции",
    coverage: "покрытие",
    full: "Полное",
    partial: "Частичное",
    empty: "Пустое",
    deprecated: "Устаревшие",
    operations: "операций",
    conditions: "Условия",
    conditionTypes: "Условия по типам",
    covered: "Покрыто",
    total: "Всего",
    zeroCall: "Ни разу не вызваны",
    tags: "Теги",
    missed: "Невостребованные вызовы",
    calls: "вызовов",
    generated: "Сгенерировано",
    generation: "Генерация",
    specSource: "Источник спеки",
    filesRead: "Файлов покрытия",
    callsRecorded: "Записано вызовов",
    "cond.status": "HTTP-статус {status}",
    "cond.onlyDeclaredStatus": "только объявленные статусы",
    "cond.onlyDeclaredResponseFields": "только объявленные поля ответа",
    "cond.paramNotEmpty": "{in} «{name}» не пустой",
    "cond.headerEmpty": "заголовок «{name}» пустой",
    "cond.paramEnumAll": "{in} «{name}» — все значения enum [{values}]",
    "cond.paramEnumAnother": "{in} «{name}» — значение вне enum",
    "cond.notEmptyBody": "непустое тело запроса",
    "cond.propNotEmpty": "«{name}» не пустой",
    "cond.propEnumAll": "«{name}» — все значения enum [{values}]",
    "cond.propEnumAnother": "«{name}» — значение вне enum",
    "reason.noCalls": "Не было вызовов — нет статусов",
    "reason.undeclaredStatus": "Недокументированный статус: {values}",
    "reason.noResponseFields": "Поля ответа не наблюдались",
    "reason.undeclaredFields": "Недокументированные поля: {values}",
    "reason.missedValues": "Не покрыты значения [{values}]",
    "reason.checkedValues": "Проверенные значения: [{values}]",
  },
};

/** Substitutes `{placeholder}` tokens in a template. */
export function format(template: string, params?: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => params?.[k] ?? `{${k}}`);
}

/** Translates a key in a locale (falls back to en), applying params. */
export function t(locale: Locale, key: MessageKey, params?: Record<string, string>): string {
  const dict = MESSAGES[locale] ?? MESSAGES.en;
  const template = dict[key] ?? MESSAGES.en[key] ?? key;
  return format(template, params);
}

/** Translates a {@link Message} in a locale. */
export function tm(locale: Locale, message: Message): string {
  return t(locale, message.key, message.params);
}
