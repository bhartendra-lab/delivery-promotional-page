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
  Article,
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  ArrowsClockwise,
  ArrowsOut,
  ArrowsOutCardinal,
  Bell,
  Broadcast,
  Browser,
  Building,
  CalendarBlank,
  CameraSlash,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUpDown,
  Check,
  Checks,
  CheckSquare,
  Clock,
  Copy,
  CreditCard,
  DeviceMobile,
  DotsSixVertical,
  DotsThreeVertical,
  DownloadSimple,
  EnvelopeSimple,
  Export,
  Eye,
  EyeSlash,
  FloppyDisk,
  Folder,
  FolderPlus,
  Gear,
  Globe,
  Heart,
  HouseSimple,
  Image,
  Images,
  Info,
  Key,
  Link,
  LinkBreak,
  Lock,
  MagnifyingGlass,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Megaphone,
  Minus,
  Monitor,
  Palette,
  Pause,
  PencilSimple,
  Play,
  Plus,
  QrCode,
  Question,
  Receipt,
  ScanSmiley,
  ShareNetwork,
  ShieldCheck,
  SidebarSimple,
  SignOut,
  Smiley,
  Sparkle,
  Square,
  SquaresFour,
  Star,
  Target,
  Trash,
  TreeStructure,
  UploadSimple,
  User,
  Users,
  Warning,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import type { IconType } from "react-icons";
import { SiWhatsapp, SiInstagram, SiFacebook, SiYoutube, SiVimeo, SiPinterest, SiX } from "react-icons/si";

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
export const IconInstagram = wrapBrandMark(SiInstagram, 16, "IconInstagram");
export const IconFacebook = wrapBrandMark(SiFacebook, 16, "IconFacebook");
export const IconYoutube = wrapBrandMark(SiYoutube, 16, "IconYoutube");
export const IconVimeo = wrapBrandMark(SiVimeo, 16, "IconVimeo");
export const IconPinterest = wrapBrandMark(SiPinterest, 16, "IconPinterest");
// Named IconXLogo (not IconX) to avoid colliding with the generic close-glyph IconX.
export const IconXLogo = wrapBrandMark(SiX, 16, "IconXLogo");
export const IconMail = wrapPhosphor(EnvelopeSimple, 15, "IconMail");
export const IconScanFace = wrapPhosphor(ScanSmiley, 18, "IconScanFace");
export const IconShieldCheck = wrapPhosphor(ShieldCheck, 15, "IconShieldCheck");
export const IconInfo = wrapPhosphor(Info, 14, "IconInfo");
export const IconImage = wrapPhosphor(Image, 14, "IconImage");
export const IconFolder = wrapPhosphor(Folder, 16, "IconFolder");
export const IconMonitor = wrapPhosphor(Monitor, 14, "IconMonitor");
export const IconMobile = wrapPhosphor(DeviceMobile, 14, "IconMobile");
export const IconArrowRight = wrapPhosphor(ArrowRight, 14, "IconArrowRight");
export const IconArrowLeft = wrapPhosphor(ArrowLeft, 14, "IconArrowLeft");
export const IconEdit = wrapPhosphor(PencilSimple, 13, "IconEdit");
export const IconDownload = wrapPhosphor(DownloadSimple, 15, "IconDownload");
export const IconDotsVertical = wrapPhosphor(DotsThreeVertical, 15, "IconDotsVertical");
export const IconHeart = wrapPhosphor(Heart, 14, "IconHeart");
export const IconSearch = wrapPhosphor(MagnifyingGlass, 15, "IconSearch");
export const IconUsers = wrapPhosphor(Users, 15, "IconUsers");
export const IconStar = wrapPhosphor(Star, 14, "IconStar");
export const IconArchive = wrapPhosphor(Archive, 15, "IconArchive");
export const IconTarget = wrapPhosphor(Target, 15, "IconTarget");
export const IconMinus = wrapPhosphor(Minus, 15, "IconMinus");
export const IconCreditCard = wrapPhosphor(CreditCard, 15, "IconCreditCard");
export const IconReceipt = wrapPhosphor(Receipt, 15, "IconReceipt");

/**
 * The official multi-color Google "G" mark — Google's own sign-in button
 * guidelines require this exact mark, not a monochrome brand glyph, so this
 * is a standalone SVG rather than a `wrapBrandMark` (which assumes a
 * single-color `currentColor` icon).
 */
export function IconGoogle({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 1 1 0-24c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 1 0 24 44c11 0 20-9 20-20 0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.5 5A20 20 0 0 0 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C39.9 41.3 44 35.4 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}

/* ── A2: dashboard chrome ──────────────────────────────────────── */
export const IconHome = wrapPhosphor(HouseSimple, 18, "IconHome");
export const IconCalendar = wrapPhosphor(CalendarBlank, 18, "IconCalendar");
export const IconQrCode = wrapPhosphor(QrCode, 18, "IconQrCode");
export const IconSidebar = wrapPhosphor(SidebarSimple, 16, "IconSidebar");
export const IconBell = wrapPhosphor(Bell, 16, "IconBell");
export const IconHelp = wrapPhosphor(Question, 16, "IconHelp");
export const IconGear = wrapPhosphor(Gear, 16, "IconGear");
export const IconLogout = wrapPhosphor(SignOut, 16, "IconLogout");
export const IconCaretUpDown = wrapPhosphor(CaretUpDown, 14, "IconCaretUpDown");
export const IconShare = wrapPhosphor(Export, 15, "IconShare");
export const IconRestore = wrapPhosphor(ArrowCounterClockwise, 15, "IconRestore");
export const IconFolderPlus = wrapPhosphor(FolderPlus, 16, "IconFolderPlus");
export const IconImages = wrapPhosphor(Images, 16, "IconImages");
export const IconDragHandle = wrapPhosphor(DotsSixVertical, 12, "IconDragHandle");
export const IconPlus = wrapPhosphor(Plus, 15, "IconPlus");
export const IconWarningCircle = wrapPhosphor(WarningCircle, 14, "IconWarningCircle");
export const IconArticle = wrapPhosphor(Article, 28, "IconArticle");
export const IconFolderTree = wrapPhosphor(TreeStructure, 17, "IconFolderTree");
export const IconClock = wrapPhosphor(Clock, 14, "IconClock");
export const IconMove = wrapPhosphor(ArrowsOutCardinal, 15, "IconMove");
export const IconExpand = wrapPhosphor(ArrowsOut, 14, "IconExpand");
export const IconRefresh = wrapPhosphor(ArrowsClockwise, 13, "IconRefresh");
export const IconOpen = wrapPhosphor(ArrowSquareOut, 16, "IconOpen");

/* ── A4: settings & auth ───────────────────────────────────────── */
export const IconBuilding = wrapPhosphor(Building, 15, "IconBuilding");
export const IconGlobe = wrapPhosphor(Globe, 15, "IconGlobe");
export const IconShareNetwork = wrapPhosphor(ShareNetwork, 15, "IconShareNetwork");
export const IconSave = wrapPhosphor(FloppyDisk, 16, "IconSave");
export const IconKey = wrapPhosphor(Key, 18, "IconKey");
export const IconEye = wrapPhosphor(Eye, 18, "IconEye");
export const IconEyeOff = wrapPhosphor(EyeSlash, 18, "IconEyeOff");
export const IconLinkBroken = wrapPhosphor(LinkBreak, 18, "IconLinkBroken");
export const IconUser = wrapPhosphor(User, 15, "IconUser");

/* ── A5: guest side ────────────────────────────────────────────── */
export const IconMegaphone = wrapPhosphor(Megaphone, 18, "IconMegaphone");
export const IconSquare = wrapPhosphor(Square, 15, "IconSquare");
export const IconCheckSquare = wrapPhosphor(CheckSquare, 15, "IconCheckSquare");
/** Double-tick "select all" — deliberately distinct from IconSquare/
 *  IconCheckSquare so the gallery's Select and Select all stay tellable apart
 *  in the mobile icon-only cluster, where neither carries a label. */
export const IconChecks = wrapPhosphor(Checks, 15, "IconChecks");
export const IconGrid = wrapPhosphor(SquaresFour, 18, "IconGrid");
export const IconPalette = wrapPhosphor(Palette, 26, "IconPalette");
export const IconCameraOff = wrapPhosphor(CameraSlash, 30, "IconCameraOff");
export const IconBrowser = wrapPhosphor(Browser, 30, "IconBrowser");
export const IconSmiley = wrapPhosphor(Smiley, 44, "IconSmiley");
export const IconSparkle = wrapPhosphor(Sparkle, 24, "IconSparkle");
