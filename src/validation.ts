// Open for other validation libraries, but I haven't found any that were small enough,
// strongly typed and maintained.

export interface IValidationError {
  path: PropertyKey[];
  message: string;
}

export type ValidationResult<T> =
  | {
      success: true;
      value: T;
    }
  | {
      success: false;
      errors: IValidationError[];
    };

export type Validator<T> = (scrutinee: unknown) => ValidationResult<T>;

function success<T>(t: T): ValidationResult<T> {
  return {
    success: true,
    value: t,
  };
}

function failure<T>(errors: IValidationError[]): ValidationResult<T> {
  return {
    success: false,
    errors,
  };
}

function typeGuard<T>(name: string, guard: (arg: unknown) => arg is T): Validator<T> {
  return (scrutinee) => {
    if (guard(scrutinee)) {
      return success(scrutinee);
    }
    return failure([
      {
        path: [],
        message: `expected a ${name}`,
      },
    ]);
  };
}

export function string(): Validator<string> {
  function stringGuard(arg: unknown): arg is string {
    return typeof arg === 'string';
  }
  return typeGuard('string', stringGuard);
}

export function boolean(): Validator<boolean> {
  function boolGuard(arg: unknown): arg is boolean {
    return typeof arg === 'boolean';
  }
  return typeGuard('boolean', boolGuard);
}

function hasOwnProperty<X extends {}, Y extends PropertyKey>(obj: X, prop: Y): obj is X & Record<Y, unknown> {
  return obj.hasOwnProperty(prop);
}

export function object<S>(schema: { [P in keyof S]: Validator<S[P]> }): Validator<{ [P in keyof S]: S[P] }> {
  return (scrutinee) => {
    if (typeof scrutinee !== 'object' || scrutinee === null) {
      return failure([
        {
          path: [],
          message: 'expected an object',
        },
      ]);
    }

    const errors: IValidationError[] = [];
    let validationFailed = false;
    for (const key in schema) {
      if (!schema[key]) {
        continue;
      }

      // If the deserialized value doesn't have the key, use `undefined` as a placeholder
      // might get replaced with a default value
      const existingSub = hasOwnProperty(scrutinee, key) ? scrutinee[key] : undefined;
      const subResult = schema[key](existingSub);

      if (subResult.success) {
        Object.assign(scrutinee, { [key]: subResult.value });
      } else {
        subResult.errors.forEach((val) =>
          errors.push({
            path: [key, ...val.path],
            message: val.message,
          })
        );
        validationFailed = true;
      }
    }

    if (!validationFailed) {
      // when we get here, all properties in S have been validated and assigned, so
      // this type assertion is okay.
      return success(scrutinee as { [P in keyof S]: S[P] });
    }

    return failure(errors);
  };
}

export function array<S>(memberValidator: Validator<S>): Validator<S[]> {
  return (scrutinee) => {
    if (!(scrutinee instanceof Array)) {
      return failure([
        {
          path: [],
          message: 'expected an array',
        },
      ]);
    }

    const errors: IValidationError[] = [];
    let validationFailed = false;
    for (let i = 0; i < scrutinee.length; ++i) {
      const subResult = memberValidator(scrutinee[i]);
      if (subResult.success) {
        scrutinee[i] = subResult.value;
      } else {
        subResult.errors.forEach((val) =>
          errors.push({
            path: [i, ...val.path],
            message: val.message,
          })
        );
        validationFailed = true;
      }
    }

    if (!validationFailed) {
      return success(scrutinee);
    }

    return failure(errors);
  };
}

export function optional<T>(validator: Validator<T>): Validator<T | null> {
  return (scrutinee) => {
    if (scrutinee === null) {
      return success(null);
    }
    return validator(scrutinee);
  };
}

export class ValidationError extends Error {
  constructor(public errors: IValidationError[], message?: string) {
    super(`validation failure: ${errors.length} errors`);
  }
}

export function parseAndValidate<T>(text: string, validator: Validator<T>): T {
  const value: unknown = JSON.parse(text);
  const result = validator(value);
  if (result.success) {
    return result.value;
  }
  throw new ValidationError(result.errors);
}
