export enum FlameHeight {
    Step0 = '3830',
    Step1 = '3842',
    Step2 = '3937',
    Step3 = '4132',
    Step4 = '4145',
    Step5 = '4239',
    Step6 = '4335',
    Step7 = '4430',
    Step8 = '4443',
    Step9 = '4537',
    Step10 = '4633',
    Step11 = '4646',
    StepUndefined = 'undefined',
  }

export class FlameHeightUtils {
  private static readonly definedValues: FlameHeight[] = Object.values(FlameHeight)
    .filter((value): value is FlameHeight => value !== FlameHeight.StepUndefined);

  public static fromReportedOutput(output: string): FlameHeight | undefined {
    if (!/^[0-9a-f]{2}$/i.test(output)) {
      return undefined;
    }
    const position = parseInt(output, 16);
    // Observed outputs below 0x69 can represent standby or an inactive burner.
    if (position < 0x69) {
      return undefined;
    }
    const distance = (height: FlameHeight) => Math.abs(
      parseInt(Buffer.from(height, 'hex').toString('ascii'), 16) - position,
    );
    return this.definedValues.reduce((nearest, height) => distance(height) < distance(nearest) ? height : nearest);
  }

  public static ofPercentage(value: number) : FlameHeight {
    const clamped = Math.max(0, Math.min(1, value));
    const fullSteps = FlameHeightUtils.definedValues.length - 1;
    const factorStep = clamped * fullSteps;
    const index = Math.round(factorStep);
    return FlameHeightUtils.definedValues[index];
  }

  public static toPercentage(height: FlameHeight) : number {
    const index = FlameHeightUtils.definedValues.indexOf(height);
    if (index < 0) {
      return 0;
    }
    const oneStep = 100 / (FlameHeightUtils.definedValues.length - 1);
    return (index * oneStep) / 100;
  }
}
