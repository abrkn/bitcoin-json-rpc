import { Reporter } from 'io-ts/lib/Reporter';
import { PathReporter } from 'io-ts/lib/PathReporter';

export const ActuallyThrowReporter: Reporter<void> = {
  report: (validation) => {
    // eslint-disable-next-line no-underscore-dangle
    if (validation._tag === 'Left') {
      const report = PathReporter.report(validation);

      throw Object.assign(new Error(report.join('\n')), {
        data: { report },
      });
    }
  },
};
