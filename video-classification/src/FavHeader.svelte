<script lang="ts">
  import debounce from 'lodash.debounce'
  import StarFilled from "./images/star-filled.svelte";
  import StarStroke from "./images/star-stroke.svelte";
  export let onFavorite;
  export let entry;

  $: isFav = entry?.is_fav || false

  const toggleFav = debounce(() => {
    isFav = !isFav
    onFavorite?.(entry.index, isFav)
  }, 200)
</script>

<div class="fav-header">
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div class="star" on:click={toggleFav}>
    {#if isFav}
      <StarFilled />
    {/if}
    {#if !isFav}
      <StarStroke />
    {/if}
  </div>
</div>

<style>
  .fav-header {
    display: flex;
    justify-content: flex-end;
  }
  .star {
    height: 36px;
    widows: 36px;
  }
</style>
