"""ProveIt launch video (about 80 seconds), in the 3Blue1Brown / Manim style.

Render it with video/render.sh, not by hand. Shape and voice come from two settings:
  PROVEIT_SHAPE = wide (1920x1080) or square (1080x1080)
  PROVEIT_VOICE = draft (silent, word-count timing) or elevenlabs (the real narrator)

Every scene is laid out inside the middle 8x8 area, so both shapes show everything.
Captions are drawn into the picture because X plays videos muted until tapped.
"""
import os
from contextlib import contextmanager
from pathlib import Path

import numpy as np
from manim import *
from manim_voiceover import VoiceoverScene

from voice import make_voice

HERE = Path(__file__).resolve().parent

# ---------------------------------------------------------------- shape
SQUARE = os.environ.get("PROVEIT_SHAPE") == "square"
config.frame_rate = 30
if SQUARE:
    config.pixel_width, config.pixel_height = 1080, 1080
    config.frame_width = config.frame_height = 8.0
else:
    config.pixel_width, config.pixel_height = 1920, 1080
    config.frame_height = 8.0
    config.frame_width = 8.0 * 16 / 9

if os.environ.get("PROVEIT_PREVIEW"):  # quick low-resolution check
    config.pixel_width //= 2
    config.pixel_height //= 2
    config.frame_rate = 15

W, H = config.frame_width, config.frame_height
SIDE = 2.45 if SQUARE else 4.2  # how far left/right the two people stand
GAP = 2.05 if SQUARE else 2.5  # the copied profile sits this far from the middle
CY = 0.6  # vertical centre of the picture (the captions sit below it)
CAPTION_Y = -H / 2 + 0.9

# ---------------------------------------------------------------- look
BG = "#0e1117"
INK = "#f1f5f9"
MUTED = "#94a3b8"
FAINT = "#334155"
ACCENT = "#5b8cff"  # the site's #1d4ed8, lightened for a dark background
GOOD = "#34d399"
BAD = "#f87171"
WARM = "#fbbf24"
DISCORD = "#8b93ff"
SANS = "Avenir Next"
MONO = "Menlo"
config.background_color = BG


def T(text, size=30, color=INK, **kw):
    return Text(text, font=SANS, font_size=size, color=color, **kw)


def M(text, size=24, color=INK, **kw):
    return Text(text, font=MONO, font_size=size, color=color, **kw)


def card(width, height, color=FAINT, fill=BG, radius=0.18):
    return RoundedRectangle(corner_radius=radius, width=width, height=height,
                            stroke_color=color, stroke_width=3,
                            fill_color=fill, fill_opacity=1)


def person(color=INK, label=None):
    head = Circle(radius=0.24, stroke_width=0, fill_color=color, fill_opacity=1)
    body = AnnularSector(inner_radius=0, outer_radius=0.42, angle=PI, start_angle=0,
                         fill_color=color, fill_opacity=1, stroke_width=0)
    body.next_to(head, DOWN, buff=0.08)
    figure = VGroup(head, body)
    if label:
        figure.add(T(label, 24, MUTED).next_to(body, DOWN, buff=0.18))
    return figure


def avatar(letter, color, name):
    disc = Circle(radius=0.38, stroke_width=0, fill_color=color, fill_opacity=1)
    initial = T(letter, 30, BG, weight=BOLD).move_to(disc)
    caption = T(name, 22, INK).next_to(disc, DOWN, buff=0.14)
    return VGroup(VGroup(disc, initial), caption)


def bubble(text, width=None, color=FAINT):
    words = VGroup(*[T(part, 24) for part in text.split("\n")]).arrange(DOWN, aligned_edge=LEFT, buff=0.08)
    box = RoundedRectangle(corner_radius=0.22,
                           width=(width or words.width + 0.5), height=words.height + 0.42,
                           stroke_color=color, stroke_width=2,
                           fill_color="#1b2230", fill_opacity=1)
    words.move_to(box)
    return VGroup(box, words)


def check_mark(color=GOOD, size=1.0, width=8):
    mark = VMobject(stroke_color=color, stroke_width=width)
    mark.set_points_as_corners([[-0.32, 0.0, 0], [-0.1, -0.22, 0], [0.34, 0.26, 0]])
    return mark.scale(size)


def cross_mark(color=BAD, size=1.0, width=8):
    return VGroup(Line([-0.25, -0.25, 0], [0.25, 0.25, 0]),
                  Line([-0.25, 0.25, 0], [0.25, -0.25, 0])
                  ).set_stroke(color, width).scale(size)


def lock_icon(color=INK, size=1.0):
    body = RoundedRectangle(corner_radius=0.06, width=0.5, height=0.38,
                            stroke_color=color, stroke_width=4)
    loop = Arc(radius=0.16, start_angle=0, angle=PI, stroke_color=color, stroke_width=4)
    loop.next_to(body, UP, buff=0)
    return VGroup(body, loop).scale(size)


def eye_icon(color=MUTED):
    outline = Ellipse(width=0.75, height=0.38, stroke_color=color, stroke_width=4)
    pupil = Dot(radius=0.09, color=color)
    return VGroup(outline, pupil)


def key_icon(color=WARM, teeth=(2, 1, 3)):
    ring = Circle(radius=0.3, stroke_color=color, stroke_width=7)
    start = ring.get_right()
    shaft = Line(start, start + RIGHT * 1.15, stroke_color=color, stroke_width=7)
    cuts = VGroup(*[
        Line(start + RIGHT * (0.45 + 0.25 * i), start + RIGHT * (0.45 + 0.25 * i) + DOWN * 0.1 * (t + 1),
             stroke_color=color, stroke_width=7)
        for i, t in enumerate(teeth)
    ])
    return VGroup(ring, shaft, cuts)


def shield_logo(height=0.9, color=ACCENT):
    logo = SVGMobject(str(HERE / "shield.svg"), height=height)
    logo.set_fill(opacity=0).set_stroke(color, width=6)
    return logo


def link_chip():
    logo = shield_logo(0.36)
    url = M("prove-it.com.ng/v/…", 20, INK)
    row = VGroup(logo, url).arrange(RIGHT, buff=0.16)
    box = RoundedRectangle(corner_radius=0.2, width=row.width + 0.45, height=0.62,
                           stroke_color=ACCENT, stroke_width=3,
                           fill_color="#132042", fill_opacity=1)
    row.move_to(box)
    return VGroup(box, row)


def tag(text, color):
    words = T(text, 22, color)
    box = RoundedRectangle(corner_radius=0.16, width=words.width + 0.36, height=0.46,
                           stroke_color=color, stroke_width=2,
                           fill_color=BG, fill_opacity=1)
    words.move_to(box)
    return VGroup(box, words)


def sealed_box(width, height):
    """The Lit Action inside the TEE: a glowing, sealed box."""
    glow = VGroup(*[
        RoundedRectangle(corner_radius=0.3, width=width + 0.08 * i, height=height + 0.08 * i,
                         stroke_color=ACCENT, stroke_width=6, stroke_opacity=0.5 / i)
        for i in range(1, 6)
    ])
    wall = RoundedRectangle(corner_radius=0.3, width=width, height=height,
                            stroke_color=ACCENT, stroke_width=5,
                            fill_color="#0f1a33", fill_opacity=1)
    return VGroup(glow, wall)


def form_field(label, width=3.6):
    """A labelled input box, like the ones on prove-it.com.ng/new."""
    title = T(label, 20, MUTED)
    box = RoundedRectangle(corner_radius=0.1, width=width, height=0.6,
                           stroke_color=MUTED, stroke_width=2, fill_color="#141a24", fill_opacity=1)
    title.next_to(box, UP, buff=0.12, aligned_edge=LEFT)
    return VGroup(title, box)


def warn_icon(color=BAD, size=1.0):
    tri = Triangle(stroke_color=color, stroke_width=4).scale(0.2)
    mark = T("!", 16, color, weight=BOLD).move_to(tri.get_center() + DOWN * 0.03)
    return VGroup(tri, mark).scale(size)


class ProveItLaunch(VoiceoverScene):
    # ------------------------------------------------------------ narration helpers
    @contextmanager
    def say(self, *chunks):
        """Speak one script line and show it as captions.

        Each chunk is a caption string, or (caption, spoken) when the narrator should say it
        differently (for example "dot com"). `self.cue(k)` waits until chunk k is spoken.
        """
        pairs = [(c, c) if isinstance(c, str) else c for c in chunks]
        spoken = " ".join(s for _, s in pairs)
        with self.voiceover(text=spoken) as tracker:
            offsets, pos = [], 0
            for _, s in pairs:
                offsets.append(pos)
                pos += len(s) + 1
            bounds = tracker.data.get("word_boundaries") or []
            if len(bounds) >= 2:
                xs = [b["text_offset"] for b in bounds]
                ys = [b["audio_offset"] / 10_000_000 for b in bounds]
                starts = [float(np.interp(o, xs, ys)) for o in offsets]
            else:
                starts = [tracker.duration * o / len(spoken) for o in offsets]
            self.cues = [tracker.start_t + s for s in starts]
            captions = self.caption_strip([c for c, _ in pairs], starts)
            self.add(captions)
            yield tracker
        self.remove(captions)
        self.wait(0.35)

    def cue(self, k, buff=0.0):
        delay = self.cues[k] + buff - float(self.renderer.time)
        if delay > 1 / config.frame_rate:
            self.wait(delay)

    def caption_strip(self, texts, starts):
        size = 26 if SQUARE else 30
        lines = []
        for text in texts:
            words = VGroup(T(text, size, INK))
            if words.width > W - 0.9:  # too long: wrap onto two lines
                parts = text.split(" ")
                half = min(range(1, len(parts)),
                           key=lambda i: abs(len(" ".join(parts[:i])) - len(" ".join(parts[i:]))))
                words = VGroup(T(" ".join(parts[:half]), size, INK),
                               T(" ".join(parts[half:]), size, INK)).arrange(DOWN, buff=0.12)
                if words.width > W - 0.9:
                    words.scale_to_fit_width(W - 0.9)
            back = RoundedRectangle(corner_radius=0.14, width=words.width + 0.4,
                                    height=words.height + 0.3, stroke_width=0,
                                    fill_color="#000000", fill_opacity=0.55)
            line = VGroup(back, words.move_to(back))
            line.move_to([0, CAPTION_Y + (0.2 if len(words) > 1 else 0), 0])
            lines.append(line)

        def show(k):
            for i, line in enumerate(lines):
                line[0].set_fill(opacity=0.55 if i == k else 0)
                line[1].set_opacity(1 if i == k else 0)

        holder = VGroup(*lines)
        holder.elapsed = 0.0
        holder.shown = 0
        show(0)

        def follow(m, dt):
            m.elapsed += dt
            k = max(i for i, s in enumerate(starts) if s <= m.elapsed + 1e-6)
            if k != m.shown:
                m.shown = k
                show(k)

        holder.add_updater(follow)
        return holder

    def clear_picture(self, run_time=0.6):
        keep = [m for m in self.mobjects if m.updaters]
        others = [m for m in self.mobjects if m not in keep]
        if others:
            self.play(*[FadeOut(m) for m in others], run_time=run_time)

    # ------------------------------------------------------------ the video
    def construct(self):
        self.set_speech_service(make_voice(), create_subcaption=False)
        self.line1_the_problem()
        self.line2_the_link()
        self.line3_sign_in()
        self.line4_the_tee()
        self.line5_the_check()
        self.line6_the_signature()
        self.line7_verify()
        self.line7b_new_domains()
        self.line8_the_end()

    def line1_the_problem(self):
        with self.say("Someone in your DMs says they're a recruiter at Acme with a job for you,",
                      "or an admin or mod from Acme's official Discord offering to help.",
                      "Names and profile pictures are easy to copy.",
                      "So how can you be sure?"):
            alex = avatar("A", ACCENT, "Alex · Acme")
            msg1 = bubble("Hi! I'm a recruiter at Acme,\nwe'd love to hire you." if SQUARE
                          else "Hi! I'm a recruiter at Acme, we'd love to hire you.")
            row1 = VGroup(alex, msg1).arrange(RIGHT, buff=0.35).move_to([0, CY + 1.3, 0])
            if row1.width > W - 0.6:
                row1.scale_to_fit_width(W - 0.6)
            self.play(FadeIn(alex, shift=RIGHT * 0.3), run_time=0.6)
            self.play(GrowFromEdge(msg1, LEFT), run_time=0.7)

            self.cue(1)
            kai = avatar("K", DISCORD, "kai · Acme Discord")
            msg2 = bubble("Admin here, I can help\nwith your issue." if SQUARE
                          else "Admin here, I can help with your issue.")
            row2 = VGroup(kai, msg2).arrange(RIGHT, buff=0.35).move_to([0, CY - 0.4, 0])
            if row2.width > W - 0.6:
                row2.scale_to_fit_width(W - 0.6)
            self.play(FadeIn(kai, shift=RIGHT * 0.3), run_time=0.6)
            self.play(GrowFromEdge(msg2, LEFT), run_time=0.7)

            self.cue(2)
            self.play(FadeOut(msg1), FadeOut(msg2), FadeOut(row2[0]),
                      alex.animate.move_to([-GAP, CY + 0.3, 0]).scale(1.3), run_time=0.9)
            twin = alex.copy()
            self.play(twin.animate.move_to([GAP, CY + 0.3, 0]), run_time=1.0)
            same = T("identical", 24, MUTED).move_to([0, CY - 1.3, 0])
            self.play(FadeIn(same), run_time=0.5)

            self.cue(3)
            q = T("?", 120, WARM, weight=BOLD).move_to([0, CY + 0.3, 0])
            self.play(GrowFromCenter(q), FadeOut(same), run_time=0.8)
        self.clear_picture()

    def line2_the_link(self):
        with self.say("With ProveIt, ask which company they're from,",
                      ("then type its real website yourself, like acme.com,",
                       "then type its real website yourself, like acme dot com,"),
                      "never a link they send you.",
                      ("For Discord, you pick the official server and the role: admin or mod.",
                       "For Discord, you pick the official server, and the role: admin or mod."),
                      "ProveIt then creates a safe link that you send to them."):
            you = person(ACCENT, "You").move_to([-SIDE, CY - 1.3, 0])
            them = person(MUTED, "Them").move_to([SIDE, CY - 1.3, 0])
            self.play(FadeIn(you, shift=UP * 0.2), FadeIn(them, shift=UP * 0.2), run_time=0.6)
            ask = bubble("Which company?").scale(0.85).next_to(you, UP, buff=0.25)
            reply = bubble("Acme.").scale(0.85).next_to(them, UP, buff=0.25)
            self.play(GrowFromEdge(ask, DOWN), run_time=0.5)
            self.play(GrowFromEdge(reply, DOWN), run_time=0.5)

            self.cue(1)
            website = form_field("Company website").move_to([0, CY + 1.75, 0])
            typed = M("acme.com", 26, INK).move_to(website[1], aligned_edge=LEFT).shift(RIGHT * 0.25)
            by_you = T("typed by you", 20, ACCENT).next_to(website, DOWN, buff=0.15)
            self.play(FadeIn(website, shift=DOWN * 0.2), run_time=0.5)
            self.play(AddTextLetterByLetter(typed, time_per_char=0.09), FadeIn(by_you), run_time=0.9)

            self.cue(2)
            theirs = bubble("acme-verify.net/login").scale(0.85).move_to(reply, aligned_edge=DOWN)
            if theirs.get_right()[0] > W / 2 - 0.15:
                theirs.shift(LEFT * (theirs.get_right()[0] - W / 2 + 0.15))
            self.play(FadeTransform(reply, theirs), run_time=0.5)
            no = cross_mark(BAD, 1.0, 7).move_to(theirs)
            self.play(Create(no), theirs.animate.set_opacity(0.5), run_time=0.5)

            self.cue(3)
            server = form_field("Official Discord server")
            server_name = T("Acme Discord", 24, INK).move_to(server[1], aligned_edge=LEFT).shift(RIGHT * 0.25)
            roles = VGroup(T("Role:", 20, MUTED), tag("Admin", DISCORD), tag("Moderator", DISCORD)).arrange(RIGHT, buff=0.2)
            discord_form = VGroup(server, server_name, roles.next_to(server, DOWN, buff=0.2))
            discord_form.move_to([0, CY + 1.6, 0])
            self.play(FadeOut(VGroup(ask, theirs, no, by_you)),
                      FadeTransform(VGroup(website, typed), VGroup(server, server_name)), run_time=0.7)
            self.play(FadeIn(roles[0]), FadeIn(roles[1], shift=UP * 0.2), FadeIn(roles[2], shift=UP * 0.2), run_time=0.6)

            self.cue(4)
            chip = link_chip().move_to([0, CY + 1.75, 0])
            self.play(ReplacementTransform(discord_form, chip), run_time=0.8)
            send = T("send it to them", 20, MUTED).next_to(chip, DOWN, buff=0.2)
            path = Arrow(you.get_right(), them.get_left(), buff=0.3, stroke_width=4, color=ACCENT,
                         max_tip_length_to_length_ratio=0.08)
            self.play(FadeIn(send), GrowArrow(path), run_time=0.8)
        self.chip, self.tags, self.you, self.them = chip, VGroup(send, path), you, them

    def line3_sign_in(self):
        with self.say("They sign in on Google's or Discord's own page.",
                      "Their password never touches ProveIt."):
            self.play(FadeOut(self.tags), run_time=0.4)
            self.play(self.chip.animate.scale(0.75).next_to(self.them, UP, buff=0.3), run_time=1.0)

            page = card(3.1, 2.3, color=INK, fill="#141a24")
            title = T("Google  /  Discord", 24, INK).next_to(page.get_top(), DOWN, buff=0.25)
            sub = T("their own sign-in page", 18, MUTED).next_to(title, DOWN, buff=0.08)
            field = RoundedRectangle(corner_radius=0.08, width=2.4, height=0.5,
                                     stroke_color=MUTED, stroke_width=2)
            dots = M("••••••••", 22, INK).move_to(field)
            field_g = VGroup(field, dots).next_to(sub, DOWN, buff=0.3)
            login = VGroup(page, title, sub, field_g).move_to([SIDE * 0.35 if not SQUARE else 1.05, CY - 0.2, 0])
            self.play(FadeOut(self.chip), FadeIn(login, scale=0.9),
                      self.them.animate.shift(RIGHT * (0.6 if not SQUARE else 0.9)).set_opacity(0.6),
                      run_time=0.9)

            self.cue(1)
            proveit = VGroup(shield_logo(0.45), T("ProveIt", 26, INK)).arrange(RIGHT, buff=0.15)
            proveit.move_to([-SIDE * 0.9 if not SQUARE else -2.85, CY - 0.2, 0])
            self.play(FadeIn(proveit), FadeOut(self.you), run_time=0.5)
            path = Arrow(field_g.get_left(), proveit.get_right(), buff=0.2,
                         stroke_color=MUTED, stroke_width=4, max_tip_length_to_length_ratio=0.12)
            dashed = DashedVMobject(path, num_dashes=14)
            self.play(Create(dashed), run_time=0.7)
            block = cross_mark(BAD, 1.1).move_to(path.get_center())
            self.play(Create(block), run_time=0.4)
            lock = lock_icon(GOOD, 0.8).next_to(field_g, RIGHT, buff=0.12)
            self.play(FadeIn(lock, scale=0.6), run_time=0.5)
        self.clear_picture()

    def line4_the_tee(self):
        with self.say("The sign-in goes to a Lit Action:",
                      "a small program running inside Lit Protocol's TEE,",
                      ("sealed hardware that nobody can look into or tamper with.",
                       "sealed hardware that nobody can look into, or tamper with."),
                      "Not even the people who run ProveIt."):
            box = sealed_box(4.4, 3.0).move_to([0, CY - 0.1, 0])
            name = T("Lit Action", 34, INK, weight=BOLD).move_to(box.get_top() + DOWN * 0.55)
            where = T("inside Lit Protocol's TEE", 22, ACCENT).next_to(name, DOWN, buff=0.12)
            code = tag("one-time sign-in code", MUTED).move_to([-W / 2 - 2, CY - 0.6, 0])
            self.play(FadeIn(box), Write(name), run_time=1.0)
            self.play(code.animate.move_to(box.get_center() + DOWN * 0.55), run_time=1.2)

            self.cue(1)
            self.play(FadeIn(where, shift=DOWN * 0.1), run_time=0.6)
            lock = lock_icon(ACCENT, 0.9).next_to(box, UP, buff=0.18)
            self.play(FadeIn(lock, shift=DOWN * 0.2), run_time=0.6)

            self.cue(2)
            spots = [UL, UR, DL, DR] if SQUARE else [LEFT, UL, UR, RIGHT]
            eyes = VGroup(*[eye_icon().move_to(box.get_center() + d * np.array([3.2 if not SQUARE else 3.0, 1.9, 0]))
                            for d in spots])
            self.play(FadeIn(eyes), run_time=0.4)
            self.play(*[e.animate(rate_func=there_and_back).move_to(
                            box.get_center() + (e.get_center() - box.get_center()) * 0.62)
                        for e in eyes],
                      box[1].animate(rate_func=there_and_back).set_stroke(INK, width=8), run_time=1.1)
            wrench = tag("tamper", BAD).move_to(box.get_right() + RIGHT * 1.3 + DOWN * 0.9)
            if SQUARE:
                wrench.move_to(box.get_bottom() + DOWN * 0.45 + RIGHT * 1.2)
            self.play(FadeIn(wrench), run_time=0.3)
            self.play(wrench.animate(rate_func=there_and_back).shift(LEFT * 0.5 if not SQUARE else UP * 0.25),
                      run_time=0.8)

            self.cue(3)
            team = person(MUTED, "ProveIt team").scale(0.8).move_to(
                [-SIDE - 0.2 if not SQUARE else -2.9, CY - 1.4, 0])
            self.play(FadeIn(team, shift=RIGHT * 0.3), FadeOut(eyes), FadeOut(wrench), run_time=0.6)
            self.play(team.animate(rate_func=there_and_back).shift(RIGHT * 0.45), run_time=0.9)
            self.play(Indicate(lock, color=GOOD), run_time=0.7)
        self.box, self.box_name, self.box_where, self.code_chip, self.box_lock = box, name, where, code, lock
        self.play(FadeOut(self.box_lock), FadeOut(team), run_time=0.4)

    def line5_the_check(self):
        with self.say("Inside, it asks Google or Discord directly:",
                      ("does this account belong to acme.com?", "does this account belong to acme dot com?"),
                      "Does it really hold the admin or mod role?",
                      "The email and name stay inside.",
                      "It shares only what's needed:",
                      "the company domain, or the Discord username and role."):
            box_x = -2.15 if SQUARE else -2.6
            group = VGroup(self.box, self.box_name, self.box_where)
            self.play(group.animate.scale(0.7 if SQUARE else 0.82).move_to([box_x, CY - 0.1, 0]),
                      FadeOut(self.code_chip), run_time=0.9)
            provider = card(1.7 if SQUARE else 2.6, 1.3, color=INK, fill="#141a24")
            provider.move_to([2.95 if SQUARE else 3.9, CY - 0.1, 0])
            plabel = T("Google\nDiscord", 24, INK).move_to(provider)
            self.play(FadeIn(provider), FadeIn(plabel), run_time=0.6)

            ask_y, reply_y = CY + 0.25, CY - 0.45
            left_x = self.box.get_right()[0] + 0.1
            right_x = provider.get_left()[0] - 0.1

            def exchange(question, answer):
                ask = Arrow([left_x, ask_y, 0], [right_x, ask_y, 0], buff=0, stroke_width=4,
                            color=MUTED, max_tip_length_to_length_ratio=0.1)
                reply = Arrow([right_x, reply_y, 0], [left_x, reply_y, 0], buff=0, stroke_width=4,
                              color=GOOD, max_tip_length_to_length_ratio=0.1)
                q = VGroup(*[M(part, 18 if SQUARE else 20, INK) for part in question.split("\n")])
                q.arrange(DOWN, buff=0.06)
                if q.width > ask.width - 0.2:
                    q.scale_to_fit_width(ask.width - 0.2)
                q.next_to(ask, UP, buff=0.08)
                a = VGroup(check_mark(GOOD, 0.45, 6), T(answer, 20, GOOD)).arrange(RIGHT, buff=0.1)
                a.next_to(reply, DOWN, buff=0.08)
                return ask, q, reply, a

            self.cue(1)
            ask, q, reply, a = exchange("hd = acme.com?", "yes")
            self.play(GrowArrow(ask), FadeIn(q), run_time=0.8)
            self.play(GrowArrow(reply), FadeIn(a), run_time=0.7)

            self.cue(2)
            ask2, q2, reply2, a2 = exchange("role =\nAdmin or\nModerator?" if SQUARE else "role =\nAdmin or Moderator?", "yes")
            self.play(FadeOut(VGroup(ask, q, reply, a)), run_time=0.3)
            self.play(GrowArrow(ask2), FadeIn(q2), run_time=0.7)
            self.play(GrowArrow(reply2), FadeIn(a2), run_time=0.6)

            self.cue(3)
            self.play(FadeOut(VGroup(ask2, q2, reply2, a2)), run_time=0.3)
            inner = self.box[1]
            email = M("alex@acme.com", 18, MUTED)
            full = M("Alex Rivera", 18, MUTED)
            private = VGroup(email, full).arrange(DOWN, buff=0.12).move_to(inner.get_center() + DOWN * 0.15)
            self.play(FadeIn(private, shift=DOWN * 0.2), run_time=0.6)
            floor = inner.get_bottom()[1] + 0.12 + private.height / 2
            self.play(private.animate.move_to([inner.get_center()[0] + 0.15, floor, 0]).set_opacity(0.45),
                      rate_func=rate_functions.ease_in_quad, run_time=0.7)
            stay = lock_icon(MUTED, 0.5).next_to(private, LEFT, buff=0.15)
            self.play(FadeIn(stay), run_time=0.4)

            self.cue(4)
            out_y = CY + 2.45
            dom = tag("acme.com", ACCENT).move_to([inner.get_center()[0], out_y, 0])
            self.play(FadeOut(provider), FadeOut(plabel), run_time=0.4)
            self.play(FadeIn(dom, shift=UP * 0.5), run_time=0.8)

            self.cue(5)
            usr = tag("kai · Admin or Moderator", DISCORD)
            pair = VGroup(dom.copy(), T("or", 22, MUTED), usr).arrange(RIGHT, buff=0.25)
            pair.move_to([0 if SQUARE else inner.get_center()[0] + 1.8, out_y, 0])
            self.play(dom.animate.move_to(pair[0]), FadeIn(pair[1]), FadeIn(usr, shift=UP * 0.4), run_time=0.8)
        self.clear_picture()

    def line6_the_signature(self):
        with self.say("Then it signs the result with its own key,",
                      "a key made from its exact code.",
                      "Change one character, and the key changes.",
                      "Only this program can make this signature."):
            result = card(2.9, 1.5, color=INK, fill="#141a24")
            lines = VGroup(T("result", 20, MUTED), M("domain: acme.com", 20, INK),
                           M("status: verified", 20, GOOD)).arrange(DOWN, aligned_edge=LEFT, buff=0.12)
            res = VGroup(result, lines.move_to(result))
            key = key_icon(WARM)
            top = VGroup(res, key).arrange(RIGHT, buff=0.9).move_to([0, CY + 1.55, 0])
            self.play(FadeIn(res, shift=UP * 0.2), run_time=0.7)
            self.play(Create(key), run_time=0.9)

            self.cue(1)
            src = ["async function main(params) {",
                   "  const claims = await askGoogle(params);",
                   "  const ok = claims.hd === CONFIG.domain;",
                   "  return sign({ ok, domain: claims.hd });",
                   "}"]
            size = 15 if SQUARE else 18
            code = VGroup(*[M(s, size, INK) for s in src]).arrange(DOWN, aligned_edge=LEFT, buff=0.1)
            panel = card(code.width + 0.5, code.height + 0.45, color=FAINT, fill="#111826")
            code.move_to(panel)
            block = VGroup(panel, code).move_to([0, CY - 0.75, 0])
            self.play(FadeIn(block, shift=UP * 0.2), run_time=0.8)
            link = Arrow(panel.get_top(), key.get_bottom(), buff=0.12, stroke_width=4, color=WARM,
                         max_tip_length_to_length_ratio=0.12)
            made = T("made from this code", 20, WARM).next_to(link.get_center(), RIGHT, buff=0.15)
            self.play(GrowArrow(link), FadeIn(made), run_time=0.8)

            self.cue(2)
            line = code[2]
            changed = M(src[2].replace("===", "!=="), size, INK)
            changed.move_to(line, aligned_edge=LEFT)
            glyph = len(src[2][:src[2].index("===")].replace(" ", ""))
            changed[glyph].set_color(BAD)
            self.play(Transform(line, changed), run_time=0.5)
            ring = SurroundingRectangle(changed[glyph], color=BAD, buff=0.05)
            other = key_icon(BAD, teeth=(0, 3, 1)).move_to(key, aligned_edge=LEFT)
            self.play(Create(ring), Transform(key, other), run_time=0.9)
            self.wait(0.5)
            original = M(src[2], size, INK).move_to(changed, aligned_edge=LEFT)
            self.play(Transform(line, original), FadeOut(ring),
                      Transform(key, key_icon(WARM).move_to(other, aligned_edge=LEFT)), run_time=0.8)

            self.cue(3)
            seal = VGroup(Circle(radius=0.36, stroke_color=WARM, stroke_width=5),
                          T("signed", 16, WARM)).move_to(result.get_corner(UR) + LEFT * 0.15 + DOWN * 0.1)
            self.play(key.animate.move_to(seal).scale(0.5), run_time=0.7)
            self.play(FadeOut(key), GrowFromCenter(seal), run_time=0.5)
            signer = M("signer 0x961a…cfee", 18, WARM).next_to(result, DOWN, buff=0.15)
            self.play(FadeIn(signer), FadeOut(made), FadeOut(link), run_time=0.6)
        self.signed = VGroup(res, seal, signer)
        self.play(FadeOut(block), run_time=0.4)

    def line7_verify(self):
        with self.say("Your browser checks that signature",
                      "before it shows Verified or Could not verify.",
                      "The whole check takes under a minute,",
                      "so you can carry on the conversation with confidence.",
                      "And anyone can double-check the result for themselves."):
            phone = RoundedRectangle(corner_radius=0.35, width=3.2, height=4.3,
                                     stroke_color=INK, stroke_width=4)
            phone_x = 1.3 if SQUARE else 2.2
            phone.move_to([phone_x, CY - 0.1, 0])
            notch = Line(LEFT * 0.3, RIGHT * 0.3, stroke_width=5, color=INK).move_to(phone.get_top() + DOWN * 0.22)
            self.play(Create(phone), Create(notch), run_time=0.7)
            self.play(self.signed.animate.scale(0.82).move_to(phone.get_center() + UP * 0.75), run_time=0.9)
            signer = self.signed[2]
            expected = M("published: 0x961a…cfee", 14, MUTED)
            tick = check_mark(GOOD, 0.35, 6)
            VGroup(tick, expected).arrange(RIGHT, buff=0.1).next_to(signer, DOWN, buff=0.28)
            self.play(FadeIn(expected), run_time=0.5)
            self.play(Create(tick), run_time=0.4)

            self.cue(1)
            banner = RoundedRectangle(corner_radius=0.15, width=2.7, height=0.6,
                                      fill_color=GOOD, fill_opacity=1, stroke_width=0)
            words = VGroup(check_mark(BG, 0.4, 6), T("Verified", 26, BG, weight=BOLD)).arrange(RIGHT, buff=0.12)
            verified = VGroup(banner, words.move_to(banner)).next_to(expected, DOWN, buff=0.3)
            self.play(FadeIn(verified, scale=0.8), run_time=0.6)
            other = VGroup(cross_mark(BAD, 0.45, 5), T("Could not verify", 20, BAD)).arrange(RIGHT, buff=0.12)
            other.next_to(verified, DOWN, buff=0.18).set_opacity(0.45)
            self.play(FadeIn(other), run_time=0.5)

            self.cue(2)
            left_x = -2.1 if SQUARE else -3.4
            face = Circle(radius=0.55, stroke_color=INK, stroke_width=5).move_to([left_x, CY + 0.35, 0])
            hand = Line(face.get_center(), face.get_center() + UP * 0.4, stroke_color=WARM, stroke_width=6)
            pin = Dot(face.get_center(), radius=0.06, color=WARM)
            quick = T("under a minute", 26, INK).next_to(face, DOWN, buff=0.3)
            clock = VGroup(face, hand, pin, quick)
            self.play(Create(face), FadeIn(pin), Create(hand), FadeIn(quick, shift=UP * 0.15), run_time=0.7)
            self.play(Rotate(hand, -TAU * 0.75, about_point=face.get_center()), run_time=1.4,
                      rate_func=rate_functions.ease_in_out_sine)

            self.cue(3)
            carry = bubble("Great, let's continue.").scale(0.8).next_to(quick, DOWN, buff=0.35)
            self.play(Indicate(verified, scale_factor=1.06, color=GOOD), GrowFromEdge(carry, UP), run_time=0.9)

            self.cue(4)
            self.play(FadeOut(clock), FadeOut(carry), run_time=0.4)
            term = card(3.0 if SQUARE else 4.0, 1.7, color=FAINT, fill="#0a0d12")
            term.move_to([-2.1 if SQUARE else -3.4, CY - 0.1, 0])
            cmd = M("$ verify result", 17 if SQUARE else 20, INK)
            ans = VGroup(check_mark(GOOD, 0.4, 6), M("valid signature", 17 if SQUARE else 20, GOOD)).arrange(RIGHT, buff=0.12)
            VGroup(cmd, ans).arrange(DOWN, aligned_edge=LEFT, buff=0.22).move_to(term)
            who = T("anyone, anywhere", 20, MUTED).next_to(term, UP, buff=0.18)
            self.play(FadeIn(term), FadeIn(who), Write(cmd), run_time=0.9)
            self.play(FadeIn(ans, shift=RIGHT * 0.2), run_time=0.5)
        self.clear_picture()

    def line7b_new_domains(self):
        with self.say(("And if a company's website was registered in the last 90 days,",
                       "And if a company's website was registered in the last ninety days,"),
                      "a common sign of a fake look-alike,",
                      "ProveIt warns you."):
            phone = RoundedRectangle(corner_radius=0.35, width=3.2, height=4.3,
                                     stroke_color=INK, stroke_width=4)
            phone.move_to([1.3 if SQUARE else 2.2, CY - 0.1, 0])
            notch = Line(LEFT * 0.3, RIGHT * 0.3, stroke_width=5, color=INK).move_to(phone.get_top() + DOWN * 0.22)
            banner = RoundedRectangle(corner_radius=0.15, width=2.5, height=0.55,
                                      fill_color=GOOD, fill_opacity=1, stroke_width=0)
            words = VGroup(check_mark(BG, 0.4, 6), T("Verified", 24, BG, weight=BOLD)).arrange(RIGHT, buff=0.12)
            works = T("works at", 18, GOOD)
            domain = M("acme-careers.com", 20, INK)
            screen = VGroup(VGroup(banner, words.move_to(banner)), works, domain).arrange(DOWN, buff=0.16)
            screen.move_to(phone.get_top() + DOWN * 1.25)
            self.play(Create(phone), Create(notch), run_time=0.6)
            self.play(FadeIn(screen, shift=UP * 0.15), run_time=0.6)

            self.cue(1)
            real = VGroup(T("the real company", 18, MUTED), M("acme.com", 26, INK)).arrange(DOWN, buff=0.1)
            fake = VGroup(T("a look-alike", 18, BAD), M("acme-careers.com", 26, BAD)).arrange(DOWN, buff=0.1)
            pair = VGroup(real, fake).arrange(DOWN, buff=0.55).move_to([-2.3 if SQUARE else -3.2, CY + 0.2, 0])
            if pair.width > (3.1 if SQUARE else 3.6):
                pair.scale_to_fit_width(3.1 if SQUARE else 3.6)
            self.play(FadeIn(real, shift=RIGHT * 0.2), run_time=0.5)
            self.play(FadeIn(fake, shift=RIGHT * 0.2), run_time=0.6)

            self.cue(2)
            lines = VGroup(T("Registered less than", 16, BAD), T("90 days ago", 16, BAD)).arrange(DOWN, aligned_edge=LEFT, buff=0.06)
            row = VGroup(warn_icon(BAD, 0.95), lines).arrange(RIGHT, buff=0.15)
            panel = RoundedRectangle(corner_radius=0.14, width=row.width + 0.3, height=row.height + 0.3,
                                     stroke_color=BAD, stroke_width=3, fill_color=BAD, fill_opacity=0.12)
            warning = VGroup(panel, row.move_to(panel)).next_to(domain, DOWN, buff=0.35)
            self.play(FadeIn(warning, scale=0.85), run_time=0.6)
            self.play(Circumscribe(warning, color=BAD, buff=0.08), Indicate(fake[1], color=BAD), run_time=1.0)
            self.wait(1.0)
        self.clear_picture()

    def line8_the_end(self):
        with self.say("ProveIt proves who someone is,",
                      "not that their offer is real.",
                      "Never share your seed phrase.",
                      ("Try it at prove-it.com.ng.", "Try it at prove dash it, dot com, dot N G.")):
            who = T("Proves who they are.", 44 if SQUARE else 52, INK, weight=BOLD).move_to([0, CY + 1.0, 0])
            self.play(Write(who), run_time=1.1)

            self.cue(1)
            offer = T("Not that their offer is real.", 32 if SQUARE else 38, MUTED).next_to(who, DOWN, buff=0.35)
            self.play(FadeIn(offer, shift=UP * 0.2), run_time=0.8)

            self.cue(2)
            seed = VGroup(lock_icon(WARM, 0.7), T("Never share your seed phrase.", 30 if SQUARE else 34, WARM))
            seed.arrange(RIGHT, buff=0.2).next_to(offer, DOWN, buff=0.6)
            self.play(FadeIn(seed, shift=UP * 0.2), run_time=0.7)

            self.cue(3)
            self.play(FadeOut(VGroup(who, offer, seed)), run_time=0.5)
            name = VGroup(shield_logo(1.1), T("ProveIt", 64, INK, weight=BOLD)).arrange(RIGHT, buff=0.3)
            site = M("prove-it.com.ng", 36, ACCENT)
            VGroup(name, site).arrange(DOWN, buff=0.45).move_to([0, CY + 0.2, 0])
            self.play(DrawBorderThenFill(name[1]), Create(name[0]), run_time=1.0)
            self.play(FadeIn(site, shift=UP * 0.15), run_time=0.6)
        credit = T("Voice: elevenlabs.io", 18, MUTED).move_to([0, -H / 2 + 0.45, 0])
        self.play(FadeIn(credit), run_time=0.5)
        self.wait(2.5)
