"use client";

import Image from "next/image";
import { useState } from "react";

import type { BookingPhase } from "./calendar-data";

type Props = {
  phase: BookingPhase;
  loggedIn: boolean;
};

export function TalkingBrandHeader({ phase, loggedIn }: Props) {
  const [zh, setZh] = useState(false);

  return (
    <header className="talking-brand-header">
      <div className="talking-brand-mark">
        <Image
          src="/logo.png"
          alt="Jiarui French"
          width={92}
          height={92}
          className="talking-brand-logo"
          priority
          unoptimized
        />
      </div>

      <div className="talking-brand-copy">
        <button
          type="button"
          className="talking-lang-toggle"
          onClick={() => setZh((value) => !value)}
          aria-label={zh ? "Switch to English" : "切换到中文"}
        >
          {zh ? "EN" : "中文"}
        </button>

        <p className="talking-brand-kicker">{zh ? "猫头鹰提醒" : "Owl note"}</p>
        {zh ? <ChineseMessage phase={phase} loggedIn={loggedIn} /> : <EnglishMessage phase={phase} loggedIn={loggedIn} />}
      </div>
    </header>
  );
}

function EnglishMessage({ phase, loggedIn }: Props) {
  if (!loggedIn) {
    return (
      <p className="talking-brand-text">
        Please <strong>log in first</strong> to book a timeslot.
      </p>
    );
  }

  if (phase === "phase1") {
    return (
      <p className="talking-brand-text">
        You may pick <strong>one timeslot in the whole week</strong>. Come back{" "}
        <strong>Thursday and after</strong> to pick other dates.
      </p>
    );
  }

  if (phase === "phase2") {
    return (
      <p className="talking-brand-text">
        It is <strong>Thursday and after</strong>. You may pick{" "}
        <strong>one timeslot per day</strong> for the remaining dates.
      </p>
    );
  }

  if (phase === "gap") {
    return (
      <p className="talking-brand-text">
        Booking is <strong>paused until Thursday noon</strong>. You can still
        review the calendar now.
      </p>
    );
  }

  return (
    <p className="talking-brand-text">
      Booking is <strong>closed right now</strong>. Come back{" "}
      <strong>Monday at noon</strong>.
    </p>
  );
}

function ChineseMessage({ phase, loggedIn }: Props) {
  if (!loggedIn) {
    return (
      <p className="talking-brand-text">
        请先 <strong>登录</strong>，然后才能预约时间。
      </p>
    );
  }

  if (phase === "phase1") {
    return (
      <p className="talking-brand-text">
        本周只能选择 <strong>一个时间段</strong>。请在{" "}
        <strong>周四或之后</strong> 回来选择其他日期。
      </p>
    );
  }

  if (phase === "phase2") {
    return (
      <p className="talking-brand-text">
        现在是 <strong>周四或之后</strong>。你可以为剩余日期选择{" "}
        <strong>每天一个时间段</strong>。
      </p>
    );
  }

  if (phase === "gap") {
    return (
      <p className="talking-brand-text">
        预约会 <strong>暂停到周四中午</strong>，现在可以先查看日历。
      </p>
    );
  }

  return (
    <p className="talking-brand-text">
      现在 <strong>暂时不能预约</strong>。请在 <strong>周一中午</strong> 回来。
    </p>
  );
}
