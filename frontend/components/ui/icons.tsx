"use client";

/**
 * Canonical Icon* barrel. Wraps @phosphor-icons/react (brand marks via
 * react-icons/si). Call sites are untouched — same names, same props.
 * `filled` maps to Phosphor's `weight="fill"`; otherwise `weight ?? "regular"`.
 */
import type { CSSProperties } from "react";
import type { Icon as PhosphorIcon, IconWeight } from "@phosphor-icons/react";
import {
  Archive,
  ArrowRight,
  Broadcast,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  Copy,
  DeviceMobile,
  DotsThreeVertical,
  DownloadSimple,
  EnvelopeSimple,
  Folder,
  Heart,
  Image,
  Info,
  Link,
  Lock,
  MagnifyingGlass,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Monitor,
  Pause,
  PencilSimple,
  Play,
  ScanSmiley,
  ShieldCheck,
  Star,
  Target,
  Trash,
  UploadSimple,
  Users,
  Warning,
  X,
} from "@phosphor-icons/react";
import type { IconType } from "react-icons";
import { SiWhatsapp } from "react-icons/si";

export type IconProps = {
  size?: number;
  weight?: IconWeight;
  className?: string;
  style?: CSSProperties;
  filled?: boolean;
};

function wrapPhosphor(Glyph: PhosphorIcon, defaultSize: number, displayName: string) {
  function WrappedIcon({ size = defaultSize, weight, className, style, filled }: IconProps) {
    return (
      <Glyph
        size={size}
        weight={filled ? "fill" : weight ?? "regular"}
        className={className}
        style={style}
      />
    );
  }
  WrappedIcon.displayName = displayName;
  return WrappedIcon;
}

function wrapBrandMark(Glyph: IconType, defaultSize: number, displayName: string) {
  function WrappedIcon({ size = defaultSize, className, style }: IconProps) {
    return <Glyph size={size} className={className} style={style} />;
  }
  WrappedIcon.displayName = displayName;
  return WrappedIcon;
}

export const IconLock = wrapPhosphor(Lock, 14, "IconLock");
export const IconBroadcast = wrapPhosphor(Broadcast, 14, "IconBroadcast");
export const IconWarning = wrapPhosphor(Warning, 14, "IconWarning");
export const IconCaretDown = wrapPhosphor(CaretDown, 13, "IconCaretDown");
export const IconX = wrapPhosphor(X, 15, "IconX");
export const IconCheck = wrapPhosphor(Check, 14, "IconCheck");
export const IconUpload = wrapPhosphor(UploadSimple, 14, "IconUpload");
export const IconPause = wrapPhosphor(Pause, 14, "IconPause");
export const IconPlay = wrapPhosphor(Play, 14, "IconPlay");
export const IconLink = wrapPhosphor(Link, 14, "IconLink");
export const IconCopy = wrapPhosphor(Copy, 14, "IconCopy");
export const IconZoomIn = wrapPhosphor(MagnifyingGlassPlus, 16, "IconZoomIn");
export const IconZoomOut = wrapPhosphor(MagnifyingGlassMinus, 16, "IconZoomOut");
export const IconTrash = wrapPhosphor(Trash, 15, "IconTrash");
export const IconChevronLeft = wrapPhosphor(CaretLeft, 20, "IconChevronLeft");
export const IconChevronRight = wrapPhosphor(CaretRight, 20, "IconChevronRight");
export const IconWhatsApp = wrapBrandMark(SiWhatsapp, 16, "IconWhatsApp");
export const IconMail = wrapPhosphor(EnvelopeSimple, 15, "IconMail");
export const IconScanFace = wrapPhosphor(ScanSmiley, 18, "IconScanFace");
export const IconShieldCheck = wrapPhosphor(ShieldCheck, 15, "IconShieldCheck");
export const IconInfo = wrapPhosphor(Info, 14, "IconInfo");
export const IconImage = wrapPhosphor(Image, 14, "IconImage");
export const IconFolder = wrapPhosphor(Folder, 16, "IconFolder");
export const IconMonitor = wrapPhosphor(Monitor, 14, "IconMonitor");
export const IconMobile = wrapPhosphor(DeviceMobile, 14, "IconMobile");
export const IconArrowRight = wrapPhosphor(ArrowRight, 14, "IconArrowRight");
export const IconEdit = wrapPhosphor(PencilSimple, 13, "IconEdit");
export const IconDownload = wrapPhosphor(DownloadSimple, 15, "IconDownload");
export const IconDotsVertical = wrapPhosphor(DotsThreeVertical, 15, "IconDotsVertical");
export const IconHeart = wrapPhosphor(Heart, 14, "IconHeart");
export const IconSearch = wrapPhosphor(MagnifyingGlass, 15, "IconSearch");
export const IconUsers = wrapPhosphor(Users, 15, "IconUsers");
export const IconStar = wrapPhosphor(Star, 14, "IconStar");
export const IconArchive = wrapPhosphor(Archive, 15, "IconArchive");
export const IconTarget = wrapPhosphor(Target, 15, "IconTarget");
