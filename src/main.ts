import { App, Plugin, PluginSettingTab, Setting } from "obsidian";

type DockSide = "left" | "right";
const DOCK_SIDES: DockSide[] = ["left", "right"];
const GESTURE_RESET_MS = 180;

interface SidebarSwipeSettings {
	enableLeftSidebar: boolean;
	enableRightSidebar: boolean;
	swipeThreshold: number;
	cooldownMs: number;
	invertDirection: boolean;
}

const DEFAULT_SETTINGS: SidebarSwipeSettings = {
	enableLeftSidebar: true,
	enableRightSidebar: true,
	swipeThreshold: 40,
	cooldownMs: 300,
	invertDirection: true,
};

interface DockTabs {
	children: unknown[];
	currentTab?: unknown;
	tabHeaderContainerEl?: HTMLElement;
	selectTabIndex(index: number): void;
}

interface DockSplit {
	children?: unknown[];
}

interface InternalWorkspace {
	leftSplit?: DockSplit;
	rightSplit?: DockSplit;
}

interface GestureState {
	accumulatedDeltaX: number;
	lastEventAt: number;
	lastSwitchAt: number;
}

function isDockTabs(candidate: unknown): candidate is DockTabs {
	if (!candidate || typeof candidate !== "object") {
		return false;
	}

	const maybeTabs = candidate as Partial<DockTabs>;
	return Array.isArray(maybeTabs.children) && typeof maybeTabs.selectTabIndex === "function";
}

export default class SidebarSwipeSwitcherPlugin extends Plugin {
	settings: SidebarSwipeSettings = DEFAULT_SETTINGS;
	private dockElements: Partial<Record<DockSide, HTMLElement>> = {};
	private dockTabsCache: Partial<Record<DockSide, DockTabs>> = {};

	private readonly gestureState: Record<DockSide, GestureState> = {
		left: {
			accumulatedDeltaX: 0,
			lastEventAt: 0,
			lastSwitchAt: 0,
		},
		right: {
			accumulatedDeltaX: 0,
			lastEventAt: 0,
			lastSwitchAt: 0,
		},
	};

	private readonly dockWheelHandlers: Record<DockSide, (event: WheelEvent) => void> = {
		left: (event) => this.handleWheel("left", event),
		right: (event) => this.handleWheel("right", event),
	};

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "sidebar-swipe-switcher-next-left-tab",
			name: "Sidebar Swipe Switcher: Next left sidebar tab",
			callback: () => this.cycleDock("left", 1),
		});

		this.addCommand({
			id: "sidebar-swipe-switcher-previous-left-tab",
			name: "Sidebar Swipe Switcher: Previous left sidebar tab",
			callback: () => this.cycleDock("left", -1),
		});

		this.addCommand({
			id: "sidebar-swipe-switcher-next-right-tab",
			name: "Sidebar Swipe Switcher: Next right sidebar tab",
			callback: () => this.cycleDock("right", 1),
		});

		this.addCommand({
			id: "sidebar-swipe-switcher-previous-right-tab",
			name: "Sidebar Swipe Switcher: Previous right sidebar tab",
			callback: () => this.cycleDock("right", -1),
		});

		this.addSettingTab(new SidebarSwipeSettingTab(this.app, this));

		this.registerEvent(this.app.workspace.on("layout-change", () => this.refreshDockBindings()));
		this.register(() => this.detachDockListeners());

		this.refreshDockBindings();
		this.app.workspace.onLayoutReady(() => this.refreshDockBindings());
	}

	private refreshDockBindings(): void {
		this.detachDockListeners();

		for (const side of DOCK_SIDES) {
			const dockElement = this.queryDockElement(side);
			const dockTabs = this.resolveDockTabs(side);

			if (dockElement) {
				dockElement.addEventListener("wheel", this.dockWheelHandlers[side], { passive: false });
				this.dockElements[side] = dockElement;
			}

			if (dockTabs) {
				this.dockTabsCache[side] = dockTabs;
			}
		}
	}

	private detachDockListeners(): void {
		for (const side of DOCK_SIDES) {
			const dockElement = this.dockElements[side];
			if (!dockElement) {
				continue;
			}

			dockElement.removeEventListener("wheel", this.dockWheelHandlers[side]);
		}

		this.dockElements = {};
		this.dockTabsCache = {};
	}

	private handleWheel(side: DockSide, event: WheelEvent): void {
		if (event.defaultPrevented || !this.isDockEnabled(side) || !this.isEligibleSwipe(event)) {
			return;
		}

		const state = this.gestureState[side];
		const now = Date.now();
		const isNewGesture = now - state.lastEventAt > GESTURE_RESET_MS;

		if (isNewGesture) {
			state.accumulatedDeltaX = 0;
		}

		state.lastEventAt = now;
		state.accumulatedDeltaX += event.deltaX;

		if (Math.abs(state.accumulatedDeltaX) < this.settings.swipeThreshold) {
			return;
		}

		// Keep the cooldown within one continuous swipe, but let a clearly new
		// gesture trigger immediately so the dock does not feel laggy.
		if (!isNewGesture && now - state.lastSwitchAt < this.settings.cooldownMs) {
			state.accumulatedDeltaX = 0;
			return;
		}

		let direction: 1 | -1 = state.accumulatedDeltaX > 0 ? 1 : -1;
		if (this.settings.invertDirection) {
			direction = direction === 1 ? -1 : 1;
		}

		state.accumulatedDeltaX = 0;

		if (!this.cycleDock(side, direction)) {
			return;
		}

		state.lastSwitchAt = now;
		event.preventDefault();
		event.stopPropagation();
	}

	private isEligibleSwipe(event: WheelEvent): boolean {
		if (event.ctrlKey || event.altKey || event.metaKey) {
			return false;
		}

		if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) {
			return false;
		}

		if (Math.abs(event.deltaX) < 10) {
			return false;
		}

		if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
			return false;
		}

		const target = event.target;
		if (!(target instanceof HTMLElement)) {
			return false;
		}

		return !target.closest("input, textarea, select, [contenteditable='true']");
	}

	private isDockEnabled(side: DockSide): boolean {
		return side === "left" ? this.settings.enableLeftSidebar : this.settings.enableRightSidebar;
	}

	private cycleDock(side: DockSide, direction: 1 | -1): boolean {
		const tabs = this.getDockTabs(side);
		if (!tabs || tabs.children.length < 2) {
			return false;
		}

		const currentIndex = this.getActiveTabIndex(tabs);
		const nextIndex = this.wrapIndex(currentIndex + direction, tabs.children.length);

		tabs.selectTabIndex(nextIndex);
		return true;
	}

	private getDockTabs(side: DockSide): DockTabs | null {
		const cachedTabs = this.dockTabsCache[side];
		if (isDockTabs(cachedTabs)) {
			return cachedTabs;
		}

		const resolvedTabs = this.resolveDockTabs(side);
		if (resolvedTabs) {
			this.dockTabsCache[side] = resolvedTabs;
		}

		return resolvedTabs;
	}

	private resolveDockTabs(side: DockSide): DockTabs | null {
		const workspace = this.app.workspace as typeof this.app.workspace & InternalWorkspace;
		const split = side === "left" ? workspace.leftSplit : workspace.rightSplit;

		if (!split?.children) {
			return null;
		}

		const tabs = split.children.find((child) => isDockTabs(child));
		return tabs ?? null;
	}

	private queryDockElement(side: DockSide): HTMLElement | null {
		const selector = side === "left"
			? ".workspace-split.mod-left-split"
			: ".workspace-split.mod-right-split";

		return document.querySelector<HTMLElement>(selector);
	}

	private getActiveTabIndex(tabs: DockTabs): number {
		if (tabs.currentTab) {
			const activeIndex = tabs.children.findIndex((child) => child === tabs.currentTab);
			if (activeIndex >= 0) {
				return activeIndex;
			}
		}

		const headers = tabs.tabHeaderContainerEl?.querySelectorAll(".workspace-tab-header");
		if (!headers || headers.length === 0) {
			return 0;
		}

		const activeIndex = Array.from(headers).findIndex((header) => header.classList.contains("is-active"));
		return activeIndex >= 0 ? activeIndex : 0;
	}

	private wrapIndex(index: number, count: number): number {
		return ((index % count) + count) % count;
	}

	private async loadSettings(): Promise<void> {
		const storedSettings = await this.loadData() as Partial<SidebarSwipeSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, storedSettings);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}

class SidebarSwipeSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: SidebarSwipeSwitcherPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Sidebar Swipe Switcher" });
		containerEl.createEl("p", {
			text: "Swipe horizontally on the touchpad while the pointer is over the left or right sidebar to change tabs.",
		});

		new Setting(containerEl)
			.setName("Enable left sidebar")
			.setDesc("Allow swipe gestures to switch tabs in the left sidebar.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableLeftSidebar)
					.onChange(async (value) => {
						this.plugin.settings.enableLeftSidebar = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Enable right sidebar")
			.setDesc("Allow swipe gestures to switch tabs in the right sidebar.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableRightSidebar)
					.onChange(async (value) => {
						this.plugin.settings.enableRightSidebar = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Swipe threshold")
			.setDesc("How much horizontal gesture movement is required before switching tabs.")
			.addSlider((slider) =>
				slider
					.setLimits(40, 200, 10)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.swipeThreshold)
					.onChange(async (value) => {
						this.plugin.settings.swipeThreshold = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Cooldown")
			.setDesc("Minimum delay between sidebar tab switches during a single gesture.")
			.addSlider((slider) =>
				slider
					.setLimits(100, 800, 25)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.cooldownMs)
					.onChange(async (value) => {
						this.plugin.settings.cooldownMs = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Invert direction")
			.setDesc("Flip the swipe direction if the natural feel is backwards on your trackpad.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.invertDirection)
					.onChange(async (value) => {
						this.plugin.settings.invertDirection = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
