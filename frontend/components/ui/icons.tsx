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
  CheckSquare,
  Clock,
  Copy,
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
  Monitor,
  Palette,
  Pause,
  PencilSimple,
  Play,
  Plus,
  QrCode,
  Question,
  ScanSmiley,
  ShareNetwork,
  ShieldCheck,
  SidebarSimple,
  SignOut,
  Smiley,
  Square,
  SquaresFour,
  Star,
  Target,
  Trash,
  TreeStructure,
  UploadSimple,
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

/* ── A5: guest side ────────────────────────────────────────────── */
export const IconMegaphone = wrapPhosphor(Megaphone, 18, "IconMegaphone");
export const IconSquare = wrapPhosphor(Square, 15, "IconSquare");
export const IconCheckSquare = wrapPhosphor(CheckSquare, 15, "IconCheckSquare");
export const IconGrid = wrapPhosphor(SquaresFour, 18, "IconGrid");
export const IconPalette = wrapPhosphor(Palette, 26, "IconPalette");
export const IconCameraOff = wrapPhosphor(CameraSlash, 30, "IconCameraOff");
export const IconBrowser = wrapPhosphor(Browser, 30, "IconBrowser");
export const IconSmiley = wrapPhosphor(Smiley, 44, "IconSmiley");
