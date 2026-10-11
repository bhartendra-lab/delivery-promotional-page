import { test } from "node:test";
import assert from "node:assert/strict";
import {
  periodLabel,
  formatValidityDate,
  formatShortDay,
  formatEventDay,
  formatClockTime,
  istHour,
  validityDaysLeft,
  closesInLabel,
  VALIDITY_CLOSING_SOON_DAYS,
  bestValueIndex,
  guardSentence,
  guardFollowUp,
  maskEmail,
  partOfDay,
  timeOfDayTint,
  TIME_TINT_STRENGTH,
  daySpanLabel,
  reelPhotoAlt,
  lastPhotoLine,
  favouriteCaption,
  looksLikeEmail,
  type ValidityGuard,
  type ValidityReel,
} from "./event-validity.ts";

const ist = (iso: string) => Date.parse(`${iso}+05:30`);
const DASHES = /[–—]/;

test("periodLabel: singular for one month", () => {
  assert.equal(periodLabel(1), "1 month");
  assert.equal(periodLabel(3), "3 months");
  assert.equal(periodLabel(12), "12 months");
});

test("formatValidityDate: the IST day, whatever zone the reader is in", () => {
  assert.equal(formatValidityDate(ist("2026-10-17T23:59:59.999")), "17 Oct 2026");
  // The same instant is still the 17th in India though it is the 18th in UTC+13
  // and still the 17th in UTC: only India's calendar decides.
  assert.equal(formatValidityDate(Date.UTC(2026, 9, 17, 18, 29, 59, 999)), "17 Oct 2026");
  assert.equal(formatValidityDate(Date.UTC(2026, 9, 17, 18, 30)), "18 Oct 2026");
  assert.equal(formatValidityDate(ist("2027-01-07T12:00:00")), "7 Jan 2027");
});

test("formatShortDay / formatEventDay / formatClockTime: how the page says a moment", () => {
  assert.equal(formatShortDay(ist("2026-10-03T09:00:00")), "3 Oct");
  assert.equal(formatEventDay(ist("2026-02-14T18:30:00")), "Saturday, 14 February 2026");
  assert.equal(formatClockTime(ist("2026-02-14T16:12:00")), "4:12 PM");
  assert.equal(formatClockTime(ist("2026-02-14T23:48:00")), "11:48 PM");
  assert.equal(formatClockTime(ist("2026-02-14T09:05:00")), "9:05 AM");
  assert.equal(formatClockTime(ist("2026-02-14T00:07:00")), "12:07 AM");
  assert.equal(formatClockTime(ist("2026-02-14T12:00:00")), "12:00 PM");
});

test("istHour: the hour on India's clock", () => {
  assert.equal(istHour(ist("2026-02-14T00:10:00")), 0);
  assert.equal(istHour(ist("2026-02-14T16:12:00")), 16);
  assert.equal(istHour(ist("2026-02-14T23:59:00")), 23);
  assert.equal(istHour(Date.UTC(2026, 1, 14, 20, 0)), 1);
});

test("validityDaysLeft / closesInLabel: whole days before the closing day, which is itself 'today'", () => {
  const end = ist("2026-10-17T23:59:59.999");
  // Any time on the 17th it is live till midnight: today.
  assert.equal(validityDaysLeft(end, ist("2026-10-17T00:00:00")), 0);
  assert.equal(validityDaysLeft(end, ist("2026-10-17T10:00:00")), 0);
  assert.equal(validityDaysLeft(end, end), 0);
  assert.equal(closesInLabel(end, ist("2026-10-17T10:00:00")), "Closes today");
  // Any time on the 16th: tomorrow, whether it is 00:05 or 23:55.
  assert.equal(validityDaysLeft(end, ist("2026-10-16T00:05:00")), 1);
  assert.equal(validityDaysLeft(end, ist("2026-10-16T23:55:00")), 1);
  assert.equal(closesInLabel(end, ist("2026-10-16T23:55:00")), "Closes tomorrow");
  assert.equal(closesInLabel(end, ist("2026-10-14T10:00:00")), "Closes in 3 days");
  assert.equal(validityDaysLeft(end, ist("2026-10-10T12:00:00")), 7);
  assert.equal(VALIDITY_CLOSING_SOON_DAYS, 7);
  // Past the end there is nothing left.
  assert.equal(validityDaysLeft(end, end + 1), 0);
});

test("bestValueIndex: the lowest price per month, wherever it sits", () => {
  assert.equal(bestValueIndex([{ months: 3, price: 199 }, { months: 6, price: 299 }, { months: 12, price: 499 }]), 2);
  // Not assumed to be the longest: a promotion on the middle period wins.
  assert.equal(bestValueIndex([{ months: 3, price: 199 }, { months: 6, price: 150 }, { months: 12, price: 499 }]), 1);
  assert.equal(bestValueIndex([{ months: 1, price: 30 }, { months: 12, price: 499 }]), 0);
});

test("bestValueIndex: nothing to mark with one option or a flat rate; the longer period on a tie", () => {
  assert.equal(bestValueIndex([]), -1);
  assert.equal(bestValueIndex([{ months: 3, price: 199 }]), -1);
  assert.equal(bestValueIndex([{ months: 1, price: 100 }, { months: 2, price: 200 }]), -1);
  assert.equal(bestValueIndex([{ months: 1, price: 150 }, { months: 3, price: 300 }, { months: 6, price: 600 }]), 2);
});

const guard = (by: "you" | "studio" | "client", by_name: string | null = null): ValidityGuard => ({
  extended: true,
  count: 1,
  last: { at: ist("2026-10-03T15:00:00"), months: 3, to: ist("2027-01-17T23:59:59.999"), by, by_name },
});

test("guardSentence: a Client is told who extended it, in words that fit them", () => {
  assert.equal(guardSentence(guard("you", "Aanya"), "client"), "You extended this on 3 Oct by 3 months.");
  assert.equal(guardSentence(guard("studio", "Kamal"), "client"), "Your photographer extended this on 3 Oct by 3 months.");
  assert.equal(guardSentence(guard("client", "Rohan"), "client"), "Rohan extended this on 3 Oct by 3 months.");
  assert.equal(guardSentence(guard("client"), "client"), "Someone extended this on 3 Oct by 3 months.");
});

test("guardSentence: a Studio is told about its Client, or itself", () => {
  assert.equal(guardSentence(guard("client", "Aanya"), "studio"), "A Client, Aanya, extended this on 3 Oct by 3 months.");
  assert.equal(guardSentence(guard("client"), "studio"), "A Client extended this on 3 Oct by 3 months.");
  assert.equal(guardSentence(guard("studio", "Kamal"), "studio"), "Your studio extended this on 3 Oct by 3 months.");
});

test("guardSentence / guardFollowUp: nothing at all for an event never extended", () => {
  for (const none of [null, undefined, { extended: false, count: 0, last: null }]) {
    assert.equal(guardSentence(none, "client"), null);
    assert.equal(guardFollowUp(none), null);
  }
  assert.equal(guardFollowUp(guard("you")), "It is live till 17 Jan 2027. Paying again adds more time on top.");
  const oneMonth: ValidityGuard = { extended: true, count: 2, last: { ...guard("you").last!, months: 1 } };
  assert.equal(guardSentence(oneMonth, "client"), "You extended this on 3 Oct by 1 month.");
});

test("maskEmail: enough to recognise your own address", () => {
  assert.equal(maskEmail("aanya.sharma@gmail.com"), "a•••@gmail.com");
  assert.equal(maskEmail("  r@studio.in "), "r•••@studio.in");
  // Nothing sensible to mask: handed back as it was rather than mangled.
  assert.equal(maskEmail("not-an-email"), "not-an-email");
  assert.equal(maskEmail("@nobody.in"), "@nobody.in");
  assert.equal(maskEmail(null), "");
});

test("partOfDay: morning, afternoon, golden hour and night", () => {
  assert.deepEqual([5, 10].map(partOfDay), ["morning", "morning"]);
  assert.deepEqual([11, 15].map(partOfDay), ["afternoon", "afternoon"]);
  assert.deepEqual([16, 18].map(partOfDay), ["golden", "golden"]);
  assert.deepEqual([19, 23, 0, 4].map(partOfDay), ["night", "night", "night", "night"]);
  // Hours are taken round the clock rather than trusted to be 0 to 23.
  assert.equal(partOfDay(24 + 9), "morning");
  assert.equal(partOfDay(-1), "night");
});

test("timeOfDayTint: the theme's own background, moved a little toward that hour's light", () => {
  const bg = "#FBF7F4";
  const channels = (css: string) => css.match(/\d+/g)!.map(Number);
  const base = [0xfb, 0xf7, 0xf4];
  for (const hour of [8, 13, 17, 22]) {
    const mixed = channels(timeOfDayTint(hour, bg));
    assert.equal(mixed.length, 3);
    // Never more than the stated strength away from the theme on any channel.
    mixed.forEach((value, i) => assert.ok(Math.abs(value - base[i]) <= Math.ceil(255 * TIME_TINT_STRENGTH), `${hour}h channel ${i}`));
  }
  assert.ok(TIME_TINT_STRENGTH <= 0.08);
  // Night pulls a light background darker; morning gold pulls its blue down.
  assert.ok(channels(timeOfDayTint(22, bg))[0] < base[0]);
  assert.ok(channels(timeOfDayTint(8, bg))[2] < base[2]);
  // Four different parts of the day, four different washes.
  assert.equal(new Set([8, 13, 17, 22].map((hour) => timeOfDayTint(hour, bg))).size, 4);
  // Short hex is read; a colour it cannot read comes back untouched.
  assert.equal(timeOfDayTint(13, "#fff"), timeOfDayTint(13, "#ffffff"));
  assert.equal(timeOfDayTint(13, "rgb(1, 2, 3)"), "rgb(1, 2, 3)");
});

test("daySpanLabel: only a span worth saying", () => {
  const start = ist("2026-02-14T14:48:00");
  assert.equal(daySpanLabel(start, ist("2026-02-14T23:48:00")), "9 hours, start to finish");
  assert.equal(daySpanLabel(start, ist("2026-02-14T15:50:00")), "1 hour, start to finish");
  assert.equal(daySpanLabel(start, ist("2026-02-16T20:00:00")), "3 days, start to finish");
  // Under an hour says nothing; over a week is a camera with the wrong date.
  assert.equal(daySpanLabel(start, ist("2026-02-14T15:00:00")), null);
  assert.equal(daySpanLabel(start, ist("2026-03-14T15:00:00")), null);
  assert.equal(daySpanLabel(null, start), null);
  assert.equal(daySpanLabel(start, null), null);
  assert.equal(daySpanLabel(start, start), null);
});

const reelOf = (items: ValidityReel["items"]): ValidityReel => ({
  items,
  favourite: null,
  stats: { photos: items.length, people: 0, first_at: null, last_at: null, times_reliable: false },
});
const item = (over: Partial<ValidityReel["items"][number]> = {}) => ({
  url: "https://media.example/teaser/b1/validity/a.webp",
  width: 640,
  height: 427,
  captured_at: ist("2026-02-14T16:12:00"),
  time_reliable: true,
  liked_by_client: false,
  ...over,
});

test("reelPhotoAlt / lastPhotoLine: a clock time only when it came from the camera", () => {
  assert.equal(reelPhotoAlt("Aanya & Rohan", item()), "Photo from Aanya & Rohan, 4:12 PM");
  assert.equal(reelPhotoAlt("Aanya & Rohan", item({ time_reliable: false })), "Photo from Aanya & Rohan");
  assert.equal(reelPhotoAlt(null, item({ captured_at: null })), "Photo from the event");

  assert.equal(lastPhotoLine(reelOf([item(), item({ captured_at: ist("2026-02-14T23:48:00") })])), "And that was the last one, at 11:48 PM.");
  assert.equal(lastPhotoLine(reelOf([item({ time_reliable: false })])), "And that was the last one.");
  assert.equal(lastPhotoLine(reelOf([])), null);
  assert.equal(lastPhotoLine(null), null);
});

test("favouriteCaption: everyone's, theirs too, or only theirs", () => {
  const favourite = { url: "u", width: 1080, height: 720 };
  assert.equal(favouriteCaption({ ...favourite, hearts: 37, liked_by_client: false }), "Everyone's favourite");
  assert.equal(favouriteCaption({ ...favourite, hearts: 37, liked_by_client: true }), "Your favourite too");
  assert.equal(favouriteCaption({ ...favourite, hearts: 1, liked_by_client: true }), "One of yours");
  assert.equal(favouriteCaption({ ...favourite, hearts: 0, liked_by_client: true }), "One of yours");
});

test("looksLikeEmail: catches the obvious slip before the round trip", () => {
  for (const good of ["a@b.in", " aanya.sharma+wed@gmail.com ", "x_y@sub.domain.co"]) assert.equal(looksLikeEmail(good), true, good);
  for (const bad of ["", "aanya", "aanya@", "@gmail.com", "aanya@gmail", "a b@c.in", `${"a".repeat(250)}@b.in`]) {
    assert.equal(looksLikeEmail(bad), false, bad);
  }
});

test("nothing this module says to a person carries an em dash or an en dash", () => {
  const said = [
    periodLabel(3),
    formatValidityDate(ist("2026-10-17T23:59:59.999")),
    formatEventDay(ist("2026-02-14T18:30:00")),
    guardSentence(guard("you"), "client"),
    guardSentence(guard("studio"), "client"),
    guardSentence(guard("client", "Rohan"), "client"),
    guardSentence(guard("client", "Aanya"), "studio"),
    guardSentence(guard("studio"), "studio"),
    guardFollowUp(guard("you")),
    daySpanLabel(ist("2026-02-14T14:48:00"), ist("2026-02-14T23:48:00")),
    lastPhotoLine(reelOf([item()])),
    reelPhotoAlt("Aanya & Rohan", item()),
    favouriteCaption({ url: "u", width: 1, height: 1, hearts: 3, liked_by_client: true }),
  ];
  for (const line of said) assert.doesNotMatch(String(line), DASHES);
});
