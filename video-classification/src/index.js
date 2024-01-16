import InstanceView from "./InstanceView.svelte";
import OptionsView from "./OptionsView.svelte";

export function getInstance(
  div,
  viewOptions,
  entry,
  modelColumn,
  labelColumn,
  dataColumn,
  idColumn,
  handlers,
) {
  new InstanceView({
    target: div,
    props: {
      entry: entry,
      viewOptions: viewOptions,
      modelColumn: modelColumn,
      labelColumn: labelColumn,
      dataColumn: dataColumn,
      idColumn: idColumn,
      handlers,
    },
    hydrate: true,
  });
}

export function getOptions(div, setOptions) {
  new OptionsView({
    target: div,
    props: {
      setOptions,
    },
  });
}
