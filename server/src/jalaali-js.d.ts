declare module 'jalaali-js' {
  export interface JalaliDate { jy: number; jm: number; jd: number; }
  export interface GregorianDate { gy: number; gm: number; gd: number; }
  export function toJalaali(gy: number, gm: number, gd: number): JalaliDate;
  export function toJalaali(date: Date): JalaliDate;
  export function toGregorian(jy: number, jm: number, jd: number): GregorianDate;
  export function isValidJalaaliDate(jy: number, jm: number, jd: number): boolean;
  export function isLeapJalaaliYear(jy: number): boolean;
  export function jalaaliMonthLength(jy: number, jm: number): number;
  const _default: {
    toJalaali: typeof toJalaali;
    toGregorian: typeof toGregorian;
    isValidJalaaliDate: typeof isValidJalaaliDate;
    isLeapJalaaliYear: typeof isLeapJalaaliYear;
    jalaaliMonthLength: typeof jalaaliMonthLength;
  };
  export default _default;
}
