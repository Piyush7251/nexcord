import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super(NumberedCanvas, self).showPage()
        super(NumberedCanvas, self).save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#5865F2"))
        
        # Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(45, 755, "Nexcord — Nexconn Build Challenge 2026")
            self.setFont("Helvetica", 8)
            self.setFillColor(colors.HexColor("#72767D"))
            self.drawRightString(567, 755, "Track: Gaming & Live Streams | Team Techie Devs")
            self.setStrokeColor(colors.HexColor("#D1D5DB"))
            self.setLineWidth(0.6)
            self.line(45, 747, 567, 747)

        # Footer (all pages)
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#5865F2"))
        self.drawString(45, 30, "Nexconn App Key: ")
        self.setFont("Courier-Bold", 8)
        self.setFillColor(colors.HexColor("#23272A"))
        self.drawString(125, 30, "n19jmcy5nw3q9")
        
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#72767D"))
        self.drawRightString(567, 30, f"Page {self._pageNumber} of {page_count}")
        self.setStrokeColor(colors.HexColor("#D1D5DB"))
        self.setLineWidth(0.6)
        self.line(45, 42, 567, 42)
        self.restoreState()

def build_pdf(filename="Nexcord_Nexconn_Challenge_Writeup.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=45,
        rightMargin=45,
        topMargin=46,
        bottomMargin=46
    )

    styles = getSampleStyleSheet()

    brand_blue = colors.HexColor("#5865F2")
    brand_dark = colors.HexColor("#1E1F22")
    brand_green = colors.HexColor("#57F287")
    text_dark = colors.HexColor("#2E3338")

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=23,
        textColor=brand_blue,
        spaceAfter=2
    )

    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor("#4F545C"),
        spaceAfter=10
    )

    h1_style = ParagraphStyle(
        'Header1',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12.5,
        leading=16,
        textColor=brand_blue,
        spaceBefore=10,
        spaceAfter=5,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13.5,
        textColor=text_dark,
        spaceAfter=5
    )

    bullet_style = ParagraphStyle(
        'Bullet',
        parent=body_style,
        leftIndent=12,
        firstLineIndent=-8,
        spaceAfter=4
    )

    code_style = ParagraphStyle(
        'CodeSnippet',
        parent=styles['Normal'],
        fontName='Courier-Bold',
        fontSize=8,
        leading=10.5,
        textColor=colors.HexColor("#5865F2")
    )

    meta_table_style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F2F3F5")),
        ('TEXTCOLOR', (0, 0), (-1, -1), text_dark),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 8.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#D1D5DB")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
    ])

    feature_table_style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#5865F2")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4.5),
        ('TOPPADDING', (0, 0), (-1, -1), 4.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8F9FA")]),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#D1D5DB")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
    ])

    story = []

    # ================= PAGE 1 =================
    story.append(Paragraph("Nexcord — Project Submission Write-up", title_style))
    story.append(Paragraph("Nexconn Build Challenge 2026 | Track: <b>Gaming &amp; Live Streams</b> | Team: <b>Techie Devs</b>", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=brand_blue, spaceBefore=0, spaceAfter=8))

    meta_data = [
        [Paragraph("Project Name:", body_style), Paragraph("<b>Nexcord</b> (Gaming, Squad Chat &amp; Live Streams)", body_style)],
        [Paragraph("Team Name:", body_style), Paragraph("<b>Techie Devs</b>", body_style)],
        [Paragraph("Nexconn App Key:", body_style), Paragraph("<b><code>n19jmcy5nw3q9</code></b>", body_style)],
        [Paragraph("Challenge Track:", body_style), Paragraph("<b>Gaming &amp; Live Streams Track</b>", body_style)],
        [Paragraph("Nexconn SDKs Used:", body_style), Paragraph("<b>Nexconn Chat SDK</b> (Required) | <b>Nexconn Chat UI</b> | <b>Nexconn Call SDK</b>", body_style)],
        [Paragraph("Supported Clients:", body_style), Paragraph("Web (React / TypeScript / Vite) &amp; Mobile (Flutter Android &amp; iOS)", body_style)],
        [Paragraph("Public GitHub Repo:", body_style), Paragraph("<b>https://github.com/Piyush7251/nexcord</b>", body_style)],
        [Paragraph("Live Cloud URL:", body_style), Paragraph("<b>https://nexcord-a85i.onrender.com</b>", body_style)],
    ]
    meta_table = Table(meta_data, colWidths=[1.6 * inch, 5.6 * inch])
    meta_table.setStyle(meta_table_style)
    story.append(meta_table)
    story.append(Spacer(1, 8))

    story.append(Paragraph("1. Executive Summary: Why We Built Nexcord", h1_style))
    story.append(Paragraph(
        "Modern competitive gaming is severely fragmented across disconnected tools: gamers match make on external web forums, talk over third-party voice links, coordinate in-game tactics on static pinboards, and watch esports livestreams on passive video platforms. Switching between games, chat tabs, and streaming overlays introduces high alt-tab friction, misaligned callouts, and communication lag.",
        body_style
    ))
    story.append(Paragraph(
        "<b>Nexcord</b> was built to eliminate this fragmentation into a single, cohesive, gamer-first communication hub. Powered by the <b>Nexconn Chat SDK</b>, <b>Chat UI SDK</b>, and <b>Call SDK</b>, Nexcord bridges high-speed tactical squad lobbies, real-time in-match callouts, rich community guild channels, and 60 FPS esports live broadcasts with interactive danmaku bullet chat into one fluid, cross-platform experience available on desktop browsers and native mobile devices (Android &amp; iOS).",
        body_style
    ))

    story.append(Paragraph("2. Problems Solved", h1_style))
    story.append(Paragraph(
        "• <b>Squad Coordination Friction:</b> Generic group chats lack matchmaking context. Nexcord introduces dedicated <b>Squad Chat Rooms</b> with 4-player team banners, dynamic role assignment, 'Ready Up' states, and interactive <b>Tactical Mini-Map Radar Pings</b> that let team leads signal locations and defensive points directly on the game map with instant synchronisation.",
        bullet_style
    ))
    story.append(Paragraph(
        "• <b>High-Pressure In-Game Typing Bottlenecks:</b> During intense clutches, players cannot afford to stop and type lengthy messages. Nexcord's <b>In-Match Quick Chat</b> provides a 4-category radial wheel (Tactical, Squad Comms, Hype, Status) and desktop hotkeys (<code>Alt+1</code> to <code>Alt+5</code>) for instantaneous 1-click tactical signals broadcast across Nexconn community subchannels.",
        bullet_style
    ))
    story.append(Paragraph(
        "• <b>Passive Spectator Disconnect:</b> Traditional esports livestreams isolate the viewer. Nexcord's <b>Spectator Live Stream Mode</b> combines a 60 FPS tactical esports broadcast with an interactive HUD overlay featuring floating <b>Danmaku / Bullet Chat</b> flying over the action, live hype reaction bursts, and real-time open-channel discussion.",
        bullet_style
    ))
    story.append(Paragraph(
        "• <b>Fragmented Voice &amp; Video Setup:</b> External third-party voice links complicate lobby setup. With Nexconn Call SDK, squad members can initiate 1-click Squad Voice Huddles and 1:1 video calls without ever leaving their active channel.",
        bullet_style
    ))
    story.append(Paragraph(
        "• <b>Frictionless Onboarding:</b> Supports instant guest gamer profiles (with auto-generated gamer tags like Striker, Ghost, Viper) as well as cellular SMS phone verification for registered players.",
        bullet_style
    ))

    # ================= PAGE 2 =================
    story.append(PageBreak())

    story.append(Paragraph("3. Deep Nexconn SDK Integration &amp; Architecture", h1_style))
    story.append(Paragraph(
        "Nexcord was designed from the ground up around the <b>Nexconn Real-Time Engine</b>. Every messaging, presence, calling, and community capability directly maps to official Nexconn SDK APIs across both our Web and Flutter clients using active App Key <b><code>n19jmcy5nw3q9</code></b>:",
        body_style
    ))

    feature_data = [
        [Paragraph("<b>Nexconn Component</b>", ParagraphStyle('TH', parent=body_style, textColor=colors.white, fontName='Helvetica-Bold')),
         Paragraph("<b>Class / API Used</b>", ParagraphStyle('TH', parent=body_style, textColor=colors.white, fontName='Helvetica-Bold')),
         Paragraph("<b>Implementation &amp; Usage in Nexcord</b>", ParagraphStyle('TH', parent=body_style, textColor=colors.white, fontName='Helvetica-Bold'))],

        [Paragraph("<b>Core Engine Lifecycle</b>", body_style),
         Paragraph("<code>NCEngine.initialize</code><br/><code>EngineProvider.connect</code><br/><code>addConnectionStatusHandler</code>", code_style),
         Paragraph("Initializes SDK with App Key <code>n19jmcy5nw3q9</code> and authenticates via SHA-1 token signature issued by backend. Handles auto-reconnect and live network status.", body_style)],

        [Paragraph("<b>Community Subchannels</b>", body_style),
         Paragraph("<code>CommunitySubChannel</code><br/><code>ChannelHandler</code><br/><code>createSubChannel</code>", code_style),
         Paragraph("Powers server channels (#general, #tactics, #squad-chat-room, #valorant-lfg) with real-time message streams, message pagination history, and unread counts.", body_style)],

        [Paragraph("<b>Open Broadcast Channels</b>", body_style),
         Paragraph("<code>OpenChannel.enterChannel</code><br/><code>OpenChannel.exitChannel</code>", code_style),
         Paragraph("Powers #valorant-finals-live stream spectator channel, supporting high-throughput spectator chatter, bullet chat, and live emoji bursts.", body_style)],

        [Paragraph("<b>Direct Messaging (DMs)</b>", body_style),
         Paragraph("<code>DirectChannel</code><br/><code>getDirectChannels</code>", code_style),
         Paragraph("Provides private 1:1 conversations between gamers, friend presence status, and private squad invites.", body_style)],

        [Paragraph("<b>Rich Messaging &amp; Typing</b>", body_style),
         Paragraph("<code>MessageHandler</code><br/><code>SendTextMessageParams</code><br/><code>SendReferenceMessageParams</code>", code_style),
         Paragraph("Real-time message listeners (receive, edit, delete), quoted replies, typing indicator broadcasts, and image/media file attachments.", body_style)],

        [Paragraph("<b>Ready-Made Chat UI</b>", body_style),
         Paragraph("<code>ai_nexconn_chatui_plugin</code><br/><code>ChannelPage</code> / <code>ChatPage</code>", code_style),
         Paragraph("Integrates pre-built Discord-style mobile chat screens in Flutter with out-of-the-box message bubble rendering, avatars, and gesture handlers.", body_style)],

        [Paragraph("<b>Voice &amp; Video Calling</b>", body_style),
         Paragraph("<code>NCCallEngine.install</code><br/><code>startCall</code> / <code>acceptCall</code><br/><code>joinCall</code> / <code>setLocalVideoView</code>", code_style),
         Paragraph("Powers 1-click Squad Voice Huddles and 1:1 video calls with microphone/camera hardware control, mute toggles, and remote video canvas rendering.", body_style)],
    ]
    feature_table = Table(feature_data, colWidths=[1.6 * inch, 2.3 * inch, 3.3 * inch])
    feature_table.setStyle(feature_table_style)
    story.append(feature_table)
    story.append(Spacer(1, 8))

    story.append(Paragraph("System Architecture Flow", h1_style))
    story.append(Paragraph(
        "• <b>Client Tier:</b> React 18 + TypeScript + Vite (Web &amp; Capacitor) and Flutter (Dart 3.7 / Flutter 3.29) on Android/iOS.<br/>"
        "• <b>Nexconn Cloud Tier:</b> Nexconn Engine (Singapore Light API cluster: <code>api.sg-light-api.com</code> / Area Code 2) managing global WebSockets, channels, and WebRTC signalling.<br/>"
        "• <b>Application Backend:</b> Node.js + Express hosted on Render, handling HMAC/SHA-1 signature token generation for Nexconn Chat v4 API, cellular SMS OTP dispatch via Fast2SMS &amp; Firebase, and real-time Server-Sent Events (SSE) synchronization.",
        body_style
    ))

    # ================= PAGE 3 =================
    story.append(PageBreak())

    story.append(Paragraph("4. Key Innovation Highlights for Gaming &amp; Live Streams", h1_style))
    story.append(Paragraph(
        "<b>1. Interactive Tactical Mini-Map Ping Radar:</b> Inside the <code>#squad-chat-room</code>, clicking anywhere on the tactical map places real-time radar ping beacons (e.g., 'Bomb Plant at Site A', 'Flank Enemy Spotted') that broadcast instantly to all squad members with sound alerts and visual animations.",
        body_style
    ))
    story.append(Paragraph(
        "<b>2. In-Match Quick-Chat Radial Overlay:</b> Pre-configured quick-callout wheels let gamers broadcast tactical callouts ('Cover Me', 'Rush B', 'Need Healing', 'GGWP') in under 200ms using mouse gestures or <code>Alt+1..5</code> shortcuts.",
        body_style
    ))
    story.append(Paragraph(
        "<b>3. Live Stream Spectator Danmaku &amp; Hype Bursts:</b> The <code>#valorant-finals-live</code> arena renders a 60 FPS esports match canvas with overlaid floating danmaku text messages and animated particle bursts powered by Nexconn <code>OpenChannel</code> events.",
        body_style
    ))
    story.append(Paragraph(
        "<b>4. 1-Click Squad Voice Huddle:</b> Team members can join low-latency voice chat directly from the squad lobby, with visual active speaker halos and instant mute/deafen controls.",
        body_style
    ))
    story.append(Paragraph(
        "<b>5. Cross-Platform Parity:</b> Identical feature sets across Web, Android, and iOS ensure teammates on different devices can play, chat, and call together without friction.",
        body_style
    ))

    story.append(Spacer(1, 6))

    story.append(Paragraph("5. Project Deliverables &amp; Verification Links", h1_style))
    links_data = [
        [Paragraph("<b>Asset</b>", ParagraphStyle('TH', parent=body_style, textColor=colors.white, fontName='Helvetica-Bold')),
         Paragraph("<b>URL / Location</b>", ParagraphStyle('TH', parent=body_style, textColor=colors.white, fontName='Helvetica-Bold')),
         Paragraph("<b>Description &amp; Judge Verification Notes</b>", ParagraphStyle('TH', parent=body_style, textColor=colors.white, fontName='Helvetica-Bold'))],
        [Paragraph("<b>GitHub Repository</b>", body_style), Paragraph("<b>https://github.com/Piyush7251/nexcord</b>", body_style), Paragraph("Public open-source repository containing Web, Flutter, and Server codebases.", body_style)],
        [Paragraph("<b>Live Web Demo</b>", body_style), Paragraph("<b>https://nexcord-a85i.onrender.com</b>", body_style), Paragraph("Live deployed cloud instance with instant guest access.", body_style)],
        [Paragraph("<b>Android APK</b>", body_style), Paragraph("<b>Nexcord-Flutter.apk</b> (in repo root)", body_style), Paragraph("Pre-compiled standalone Android APK with full native Nexconn plugins.", body_style)],
        [Paragraph("<b>Nexconn App Key</b>", body_style), Paragraph("<b>n19jmcy5nw3q9</b>", code_style), Paragraph("Active App Key registered on Nexconn Console for evaluation.", body_style)],
        [Paragraph("<b>Demo Video</b>", body_style), Paragraph("See submission form video link", body_style), Paragraph("Walkthrough of squad lobby, mini-map pings, danmaku live stream &amp; calls.", body_style)]
    ]
    links_table = Table(links_data, colWidths=[1.5 * inch, 2.9 * inch, 2.8 * inch])
    links_table.setStyle(feature_table_style)
    story.append(links_table)

    story.append(Spacer(1, 12))

    # Sign-off box
    signoff_style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F2F3F5")),
        ('BOX', (0, 0), (-1, -1), 1, brand_blue),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ])
    signoff_text = (
        "<b>Submission Confirmation:</b> This project was built by <b>Team Techie Devs</b> specifically for the "
        "<b>Nexconn Build Challenge 2026</b>. All code and assets are owned by the team or licensed for open-source use. "
        "Nexconn is granted full permission to exhibit and promote this project as outlined in the Challenge terms."
    )
    signoff_table = Table([[Paragraph(signoff_text, body_style)]], colWidths=[7.2 * inch])
    signoff_table.setStyle(signoff_style)
    story.append(signoff_table)

    # Build document
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated {filename}")

if __name__ == "__main__":
    out = "Nexcord_Nexconn_Challenge_Writeup.pdf"
    if len(sys.argv) > 1:
        out = sys.argv[1]
    build_pdf(out)
