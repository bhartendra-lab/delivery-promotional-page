import { test } from "node:test";
import assert from "node:assert/strict";
import {
  periodLabel,
  formatValidityDate,
  formatShortDay,
  formatEventDay,
  validityDaysLeft,
  closesInLabel,
  VALIDITY_CLOSING_SOON_DAYS,
  bestValueIndex,
  guardSentence,
  guardFollowUp,
  maskEmail,
  reelPhotoAlt,
  favouriteCaption,
  looksLikeEmail,
  type ValidityGuard,
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

test("formatShortDay / formatEventDay: how the page says a day", () => {
  assert.equal(formatShortDay(ist("2026-10-03T09:00:00")), "3 Oct");
  assert.equal(formatEventDay(ist("2026-02-14T18:30:00")), "Saturday, 14 February 2026");
  // India's calendar decides the day, whatever zone the reader is in.
  assert.equal(formatEventDay(Date.UTC(2026, 1, 14, 18, 29)), "Saturday, 14 February 2026");
  assert.equal(formatEventDay(Date.UTC(2026, 1, 14, 18, 30)), "Sunday, 15 February 2026");
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

test("reelPhotoAlt: where the photo is from, and its folder when it has one", () => {
  assert.equal(reelPhotoAlt("Aanya & Rohan", "Haldi"), "Photo from Aanya & Rohan, Haldi");
  assert.equal(reelPhotoAlt("Aanya & Rohan", "  Sangeet "), "Photo from Aanya & Rohan, Sangeet");
  assert.equal(reelPhotoAlt("Aanya & Rohan", null), "Photo from Aanya & Rohan");
  assert.equal(reelPhotoAlt("Aanya & Rohan"), "Photo from Aanya & Rohan");
  assert.equal(reelPhotoAlt(null, "   "), "Photo from the event");
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
    reelPhotoAlt("Aanya & Rohan", "Haldi"),
    favouriteCaption({ url: "u", width: 1, height: 1, hearts: 3, liked_by_client: true }),
  ];
  for (const line of said) assert.doesNotMatch(String(line), DASHES);
});
