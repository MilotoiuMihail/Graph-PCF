import { IInputs, IOutputs } from "./generated/ManifestTypes";

interface GridMetrics {
    gridLeft: number;
    gridTop: number;
    gridRight: number;
    gridBottom: number;
    gridWidth: number;
    gridHeight: number;
    centerX: number;
    centerY: number;
    unitSize: number;
    gridStep: number;
    axisLimitX: number;
    axisLimitY: number;
    margin: number;
}

interface Circle {
    x: number,
    y: number,
    radius: number,
    color: string,
    dashed: boolean
}

export class DemoField implements ComponentFramework.StandardControl<IInputs, IOutputs> {

    private container: HTMLDivElement;
    private context: ComponentFramework.Context<IInputs>;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private tooltip: HTMLDivElement;
    private tooltipTimeoutId: number | null = null;

    private readonly DEFAULT_CANVAS_SIZE = 400;
    private readonly MIN_CANVAS_SIZE = 200;
    private readonly INNER_CIRCLE_FILL = "#ccc";
    private readonly INNER_CIRCLE_OUTLINE = "#000"


    private circles: Circle[] = [
        // Top-left
        { x: -.975, y: 1.7, radius: 1.35, color: "#000", dashed: false },
        { x: -1.075, y: 1.75, radius: 1.35, color: "#f00", dashed: true },

        // Top-right
        { x: .975, y: 1.7, radius: 1.35, color: "#000", dashed: false },
        { x: 1.075, y: 1.75, radius: 1.35, color: "#f00", dashed: true },

        // Bottom-left
        { x: -.975, y: -1.7, radius: 1.35, color: "#000", dashed: false },
        { x: -.875, y: -1.65, radius: 1.35, color: "#f00", dashed: true },

        // Bottom-right
        { x: .975, y: -1.7, radius: 1.35, color: "#000", dashed: false },
        { x: .875, y: -1.65, radius: 1.35, color: "#f00", dashed: true },

        // Center
        { x: 0, y: 0, radius: 1.35, color: "#000", dashed: false },
        { x: 0, y: -.125, radius: 1.35, color: "#000", dashed: true }
    ];

    constructor() {
        //Empty
    }

    /**
     * Used to initialize the control instance. Controls can kick off remote server calls and other initialization actions here.
     * Data-set values are not initialized here, use updateView.
     * @param context The entire property bag available to control via Context Object; It contains values as set up by the customizer mapped to property names defined in the manifest, as well as utility functions.
     * @param notifyOutputChanged A callback method to alert the framework that the control has new outputs ready to be retrieved asynchronously.
     * @param state A piece of data that persists in one session for a single user. Can be set at any point in a controls life cycle by calling 'setControlState' in the Mode interface.
     * @param container If a control is marked control-type='standard', it will receive an empty div element within which it can render its content.
     */
    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary,
        container: HTMLDivElement
    ): void {
        this.container = container;
        this.context = context;

        this.initializeCanvas();
        this.initializeTooltip();
        this.attachCanvasClickHandler();
    }

    /**
     * Called when any value in the property bag has changed. This includes field values, data-sets, global values such as container height and width, offline status, control metadata values such as label, visible, etc.
     * @param context The entire property bag available to control via Context Object; It contains values as set up by the customizer mapped to names defined in the manifest, as well as utility functions
     */
    public updateView(context: ComponentFramework.Context<IInputs>): void {
        // Add code to update control view
        this.context = context;

        this.setCanvasSize();

        this.drawGrid();

        for (const circle of this.circles) {
            this.drawCircle(circle)
        }
    }

    /**
     * It is called by the framework prior to a control receiving new data.
     * @returns an object based on nomenclature defined in manifest, expecting object[s] for property marked as "bound" or "output"
     */
    public getOutputs(): IOutputs {
        return {};
    }

    /**
     * Called when the control is to be removed from the DOM tree. Controls should use this call for cleanup.
     * i.e. cancelling any pending remote calls, removing listeners, etc.
     */
    public destroy(): void {
        // Add code to cleanup control if necessary
    }

    private initializeCanvas(): void {
        this.canvas = document.createElement("canvas");
        this.canvas.style.border = "1px solid #000";
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext("2d")!;

        this.setCanvasSize();
    }

    private getCanvasSize(): { width: number, height: number } {
        const rawWidth = this.context.parameters.controlWidth.raw || this.DEFAULT_CANVAS_SIZE;
        const rawHeight = this.context.parameters.controlHeight.raw || this.DEFAULT_CANVAS_SIZE;

        const width = Math.max(rawWidth, this.MIN_CANVAS_SIZE);
        const height = Math.max(rawHeight, this.MIN_CANVAS_SIZE);

        return { width, height };
    }

    private setCanvasSize(): void {
        const { width, height } = this.getCanvasSize();

        this.canvas.width = width;
        this.canvas.height = height;
    }

    private initializeTooltip(): void {
        this.tooltip = document.createElement("div");

        Object.assign(this.tooltip.style, {
            position: "absolute",
            background: "rgba(0, 0, 0, 0.7)",
            color: "#fff",
            padding: "5px",
            borderRadius: "4px",
            fontSize: "12px",
            pointerEvents: "none",
            display: "none"
        });

        this.container.appendChild(this.tooltip);
    }

    private attachCanvasClickHandler(): void {
        this.canvas.addEventListener("click", (event: MouseEvent) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            if (!this.isInsideGrid(x, y)) {
                this.tooltip.style.display = "none";
                return;
            }

            const coords = this.convertPixelToGrid(x, y);
            const coordText = `(x: ${coords.x.toFixed(2)}, y: ${coords.y.toFixed(2)})`;

            this.showTooltip(event.clientX + 10, event.clientY + 10, coordText);
            this.addTooltipHideOnMouseMove();
        });
    }

    private showTooltip(left: number, top: number, text: string): void {
        const { tooltip } = this;
        tooltip.innerText = text;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
        tooltip.style.display = "block";

        if (this.tooltipTimeoutId !== null) {
            clearTimeout(this.tooltipTimeoutId);
        }

        this.tooltipTimeoutId = window.setTimeout(() => {
            tooltip.style.display = "none";
            this.tooltipTimeoutId = null;
        }, 2000);
    }

    private addTooltipHideOnMouseMove() {
        const onMouseMove = () => {
            this.tooltip.style.display = "none";
            this.canvas.removeEventListener("mousemove", onMouseMove);
        };

        this.canvas.addEventListener("mousemove", onMouseMove);
    }

    private getGridMetrics(): GridMetrics {
        const margin = 30;
        const axisLimitX = this.context.parameters.axisLimitX.raw || 1;
        const axisLimitY = this.context.parameters.axisLimitY.raw || 1;
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;

        // Compute usable area for grid
        const usableWidth = canvasWidth - 2 * margin;
        const usableHeight = canvasHeight - 2 * margin;

        // Calculate how much space one unit can occupy
        const unitSizeX = usableWidth / (axisLimitX * 2); // maxX on both sides
        const unitSizeY = usableHeight / (axisLimitY * 2); // maxY on both sides

        // Use the smaller to ensure it fits both directions
        const unitSize = Math.floor(Math.min(unitSizeX, unitSizeY) / 10) * 10

        const gridWidth = unitSize * axisLimitX * 2;
        const gridHeight = unitSize * axisLimitY * 2;

        const gridLeft = (canvasWidth - gridWidth) * .5;
        const gridTop = (canvasHeight - gridHeight) * .5;
        const gridRight = gridLeft + gridWidth;
        const gridBottom = gridTop + gridHeight;
        const centerX = gridLeft + gridWidth * .5;
        const centerY = gridTop + gridHeight * .5;

        const gridStep = unitSize * .1;

        return {
            gridLeft, gridTop, gridRight, gridBottom,
            gridWidth, gridHeight,
            centerX, centerY,
            unitSize, gridStep,
            axisLimitX, axisLimitY,
            margin
        };
    }

    private isInsideGrid(x: number, y: number): boolean {
        const { margin, gridRight, gridBottom } = this.getGridMetrics();
        return (
            x >= margin &&
            x <= gridRight &&
            y >= margin &&
            y <= gridBottom
        );
    }

    private convertPixelToGrid(pixelX: number, pixelY: number): { x: number; y: number } {
        const { centerX, centerY, unitSize } = this.getGridMetrics();

        const gridX = (pixelX - centerX) / unitSize;
        const gridY = (centerY - pixelY) / unitSize;

        return { x: gridX, y: gridY };
    }

    private convertGridToPixel(gridX: number, gridY: number): { x: number; y: number } {
        const { centerX, centerY, unitSize } = this.getGridMetrics();

        const x = centerX + gridX * unitSize;
        const y = centerY - gridY * unitSize;

        return { x, y };
    }

    private drawGrid(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawGridLines();
        this.drawAxes();
        this.drawLabels();
    }

    private drawGridLines(): void {
        const { gridLeft, gridRight, gridTop, gridBottom, gridWidth, gridHeight, unitSize, gridStep } = this.getGridMetrics();

        const halfUnitSize = unitSize * .5;

        let xPos = 0;
        for (let x = 0; x <= gridWidth; x += gridStep) {
            xPos = gridLeft + x + 0.5;
            this.ctx.beginPath();
            this.ctx.setLineDash(x % halfUnitSize === 0 ? [] : [1, 1]);
            this.ctx.moveTo(xPos, gridTop);
            this.ctx.lineTo(xPos, gridBottom);
            this.ctx.stroke();
        }

        let yPos = 0;
        for (let y = 0; y <= gridHeight; y += gridStep) {
            yPos = gridTop + y + 0.5;
            this.ctx.beginPath();
            this.ctx.setLineDash(y % halfUnitSize === 0 ? [] : [1, 1]);
            this.ctx.moveTo(gridLeft, yPos);
            this.ctx.lineTo(gridRight, yPos);
            this.ctx.stroke();
        }
    }

    private drawAxes(): void {
        const { gridLeft, gridRight, gridTop, gridBottom, centerX, centerY } = this.getGridMetrics();

        this.ctx.setLineDash([]);
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 2;

        this.ctx.beginPath();
        this.ctx.moveTo(gridLeft, centerY);
        this.ctx.lineTo(gridRight, centerY);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(centerX, gridBottom);
        this.ctx.lineTo(centerX, gridTop);
        this.ctx.stroke();
    }

    private drawLabels(): void {
        const { centerX, centerY, gridTop, gridRight, unitSize, axisLimitX, axisLimitY } = this.getGridMetrics();

        const fontSize = 10;
        this.ctx.font = `${fontSize}px sans-serif`;
        this.ctx.textAlign = "left";
        this.ctx.textBaseline = "middle";
        this.ctx.fillStyle = "#000";

        // X-axis labels
        for (let i = -axisLimitX; i <= axisLimitX; i += .5) {
            const x = centerX + i * unitSize;
            this.ctx.save();
            this.ctx.translate(x, gridTop - 5);
            this.ctx.rotate(-Math.PI * .5);
            this.ctx.fillText(i.toFixed(2), 0, 0);
            this.ctx.restore();
        }

        // Y-axis labels
        for (let j = -axisLimitY; j <= axisLimitY; j += 0.5) {
            const y = centerY - j * unitSize;
            this.ctx.fillText(j.toFixed(2), gridRight + 5, y);
        }
    }

    private drawCircle(circle: Circle): void {
        const { x, y, radius, color, dashed } = circle;
        const { unitSize } = this.getGridMetrics();

        const { x: canvasX, y: canvasY } = this.convertGridToPixel(x, y);

        //outer circle
        this.ctx.beginPath();
        this.ctx.setLineDash(dashed ? [5, 3] : []);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.arc(canvasX, canvasY, radius * unitSize, 0, Math.PI * 2);
        this.ctx.stroke();

        //inner circle
        this.ctx.beginPath();
        this.ctx.strokeStyle = this.INNER_CIRCLE_OUTLINE;
        this.ctx.setLineDash(dashed ? [6, 4] : []);
        this.ctx.arc(canvasX, canvasY, .06 * radius * unitSize, 0, Math.PI * 2);

        if (!dashed) {
            this.ctx.fillStyle = this.INNER_CIRCLE_FILL;
            this.ctx.fill();
        }

        this.ctx.stroke();
    }
}
