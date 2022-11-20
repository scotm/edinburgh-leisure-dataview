export type ArrElement<ArrType> = ArrType extends readonly (infer ElementType)[]
  ? ElementType
  : never;

export type UnwrapArray<ArrType> = ArrElement<ArrType>;
