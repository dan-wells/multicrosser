require 'test_helper'
require 'minitest/mock'

class PageControllerTest < ActionDispatch::IntegrationTest
  test "should get index" do
    sample = Crossword.new(
      'title' => 'Cryptic crossword No 12345',
      'series' => 'cryptic',
      'identifier' => '12345',
      'date' => '2026-06-01T00:00:00Z',
    )
    Series.stub :get_all, [['cryptic', [sample]]] do
      get root_url
      assert_response :success
    end
  end

  test "index offers one Nonograms entry with a radio per size" do
    Series.stub :get_all, [] do
      get root_url
    end

    assert_response :success
    assert_match(/<option value="nonograms" data-group="nonograms">Nonograms<\/option>/, response.body)
    assert_no_match(/value="nonogram-15"[^>]*>15x15 Nonograms/, response.body)
    [5, 10, 15, 20, 25].each do |size|
      assert_match(/name="size" value="nonogram-#{size}"/, response.body)
    end
  end

  # The picker validates the puzzle number client-side, and a nonogram's upper
  # bound is the publisher's ID cap rather than anything a feed reports.
  test "index carries each nonogram size's ID range on its radio" do
    Series.stub :get_all, [] do
      get root_url
    end

    assert_match(/value="nonogram-5"[^>]*data-last-puzzle="12002239"/, response.body)
    assert_match(/value="nonogram-5"[^>]*data-first-puzzle="1"/, response.body)
    assert_match(/value="nonogram-5"[^>]*data-display-name="5x5 Nonograms"/, response.body)
  end
end
